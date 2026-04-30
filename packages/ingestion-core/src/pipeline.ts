import type { ISurrealDb } from "@timesheet-ai/db";
import { storeNormalizedEvent, storeRawPayload } from "@timesheet-ai/db";
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { computeChecksum, isAlreadyIngested } from "./dedup";
import { getPlugin } from "./registry";
import type { IngestionResult } from "./types";
import { IngestionError } from "./types";

const tryStoreRaw = (
  rawPayload: unknown,
  source: Source,
  connectionId: string,
  organizationId: string,
  externalEventId: string,
  checksum: string
) =>
  Effect.gen(function* () {
    const result = yield* Effect.either(
      storeRawPayload({
        organizationId,
        source,
        connectionId,
        externalEventId,
        payload: rawPayload,
        checksum,
      })
    );
    if (result._tag === "Left") {
      yield* logError("Failed to store raw payload", {
        source,
        externalEventId,
        error: result.left.message,
      });
      return false;
    }
    return true;
  });

const tryNormalize = (
  plugin: {
    normalize: (
      raw: unknown
    ) => Effect.Effect<readonly NormalizedEvent[], IngestionError>;
  },
  rawPayload: unknown,
  source: Source,
  connectionId: string,
  externalEventId: string,
  organizationId: string
) =>
  Effect.gen(function* () {
    const result = yield* Effect.either(plugin.normalize(rawPayload));
    if (result._tag === "Left") {
      yield* logError("Normalization failed", {
        source,
        externalEventId,
        error: result.left.message,
      });
      return 0;
    }
    let count = 0;
    for (const partialEvent of result.right) {
      const fullEvent: Omit<NormalizedEvent, "id"> = {
        organizationId,
        source: partialEvent.source ?? source,
        sourceEventType: partialEvent.sourceEventType,
        eventTime: partialEvent.eventTime,
        ingestedAt: new Date().toISOString(),
        externalIdentityId: partialEvent.externalIdentityId,
        canonicalUserId: partialEvent.canonicalUserId,
        projectId: partialEvent.projectId,
        sourceRef: {
          ...partialEvent.sourceRef,
          connectionId,
          externalEventId,
        },
        content: partialEvent.content,
        attribution: partialEvent.attribution ?? {},
        processingVersion: 1,
      };
      const storeResult = yield* Effect.either(storeNormalizedEvent(fullEvent));
      if (storeResult._tag === "Right") {
        count++;
      }
    }
    return count;
  });

const tryExtractIdentities = (
  plugin: {
    extractIdentities: (raw: unknown) => Effect.Effect<
      readonly Array<{
        source: string;
        externalId: string;
        email?: string | undefined;
      }>,
      IngestionError
    >;
  },
  rawPayload: unknown
) =>
  Effect.gen(function* () {
    const result = yield* Effect.either(plugin.extractIdentities(rawPayload));
    if (result._tag === "Left") {
      return 0;
    }
    for (const candidate of result.right) {
      yield* logInfo("Identity candidate found", {
        source: candidate.source,
        externalId: candidate.externalId,
        email: candidate.email,
      });
    }
    return result.right.length;
  });

const processSinglePayload = (
  rawPayload: unknown,
  source: Source,
  connectionId: string,
  organizationId: string
) =>
  Effect.gen(function* () {
    const externalEventId = extractExternalEventId(rawPayload, source);
    const checksum = yield* Effect.promise(() => computeChecksum(rawPayload));

    const alreadyIngested = yield* isAlreadyIngested(
      connectionId,
      externalEventId
    );
    if (alreadyIngested) {
      yield* logWarn("Skipping already ingested event", {
        source,
        externalEventId,
      });
      return null;
    }

    const plugin = getPlugin(source);
    if (!plugin) {
      return yield* Effect.fail(
        new IngestionError({
          message: `No plugin registered for source: ${source}`,
          source,
        })
      );
    }

    const stored = yield* tryStoreRaw(
      rawPayload,
      source,
      connectionId,
      organizationId,
      externalEventId,
      checksum
    );

    const normalizedCount = yield* tryNormalize(
      plugin,
      rawPayload,
      source,
      connectionId,
      externalEventId,
      organizationId
    );

    const identityCount = yield* tryExtractIdentities(plugin, rawPayload);

    return {
      stored,
      normalizedCount,
      identityCount,
    };
  });

export const runIngestionPipeline = (
  source: Source,
  connectionId: string,
  organizationId: string,
  rawPayloads: readonly unknown[],
  cursor?: string
): Effect.Effect<IngestionResult, never, ISurrealDb> =>
  Effect.gen(function* () {
    let rawPayloadCount = 0;
    let normalizedEventCount = 0;
    let newIdentityCandidates = 0;
    const errors: IngestionError[] = [];

    for (const rawPayload of rawPayloads) {
      const result = yield* Effect.either(
        processSinglePayload(rawPayload, source, connectionId, organizationId)
      );

      if (result._tag === "Left") {
        errors.push(
          new IngestionError({
            message: result.left.message,
            source: result.left.source,
          })
        );
        continue;
      }

      if (result.right === null) {
        continue;
      }

      if (result.right.stored) {
        rawPayloadCount++;
      }
      normalizedEventCount += result.right.normalizedCount;
      newIdentityCandidates += result.right.identityCount;
    }

    const finalResult: IngestionResult = {
      rawPayloadCount,
      normalizedEventCount,
      newIdentityCandidates,
      errors,
      cursor,
    };

    yield* logInfo("Ingestion pipeline complete", {
      source,
      connectionId,
      rawPayloadCount,
      normalizedEventCount,
      errors: errors.length,
    });

    return finalResult;
  });

const extractExternalEventId = (payload: unknown, source: string): string => {
  const p = payload as Record<string, unknown>;
  if (source === "git") {
    if (typeof p.id === "string") {
      return p.id;
    }
    if (typeof p.sha === "string") {
      return p.sha;
    }
    const headCommit = p.head_commit as Record<string, unknown> | undefined;
    if (headCommit && typeof headCommit.id === "string") {
      return headCommit.id;
    }
  }
  if (source === "plane" && typeof p.id === "string") {
    return p.id;
  }
  if (source === "discord" && typeof p.id === "string") {
    return p.id;
  }
  return JSON.stringify(payload).slice(0, 64);
};
