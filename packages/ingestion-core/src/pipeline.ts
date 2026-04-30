import type { ISurrealDb } from "@timesheet-ai/db";
import {
  storeNormalizedEvent,
  storeRawPayload,
} from "@timesheet-ai/db";
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { computeChecksum, isAlreadyIngested } from "./dedup";
import { getPlugin } from "./registry";
import { IngestionError } from "./types";
import type { IngestionResult } from "./types";

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

    const plugin = getPlugin(source);
    if (!plugin) {
      errors.push(
        new IngestionError({
          message: `No plugin registered for source: ${source}`,
          source,
        })
      );
      return {
        rawPayloadCount,
        normalizedEventCount,
        newIdentityCandidates,
        errors,
        cursor,
      };
    }

    for (const rawPayload of rawPayloads) {
      const externalEventId = extractExternalEventId(rawPayload, source);
      const checksum = yield* Effect.promise(() =>
        computeChecksum(rawPayload)
      );

      const alreadyIngested = yield* isAlreadyIngested(
        connectionId,
        externalEventId
      );
      if (alreadyIngested) {
        yield* logWarn("Skipping already ingested event", {
          source,
          externalEventId,
        });
        continue;
      }

      const rawPayloadEither = yield* Effect.either(
        storeRawPayload({
          organizationId,
          source,
          connectionId,
          externalEventId,
          payload: rawPayload,
          checksum,
        })
      );
      if (rawPayloadEither._tag === "Left") {
        errors.push(
          new IngestionError({
            message: rawPayloadEither.left.message,
            source: "storeRawPayload",
          })
        );
        yield* logError("Failed to store raw payload", {
          source,
          externalEventId,
          error: rawPayloadEither.left.message,
        });
        continue;
      }
      rawPayloadCount++;

      const normalizedEither = yield* Effect.either(
        plugin.normalize(rawPayload)
      );
      if (normalizedEither._tag === "Left") {
        errors.push(
          new IngestionError({
            message: normalizedEither.left.message,
            source: normalizedEither.left.source,
            externalId: normalizedEither.left.externalId,
          })
        );
        yield* logError("Normalization failed", {
          source,
          externalEventId,
          error: normalizedEither.left.message,
        });
        continue;
      }

      const normalizedEvents = normalizedEither.right;
      for (const partialEvent of normalizedEvents) {
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
        const storeEventEither = yield* Effect.either(
          storeNormalizedEvent(fullEvent)
        );
        if (storeEventEither._tag === "Left") {
          errors.push(
            new IngestionError({
              message: storeEventEither.left.message,
              source: "storeNormalizedEvent",
            })
          );
          yield* logError("Failed to store normalized event", {
            source,
            externalEventId,
            error: storeEventEither.left.message,
          });
          continue;
        }
        normalizedEventCount++;
      }

      const identityCandidates = yield* Effect.either(
        plugin.extractIdentities(rawPayload)
      );
      if (identityCandidates._tag === "Right") {
        newIdentityCandidates += identityCandidates.right.length;
        for (const candidate of identityCandidates.right) {
          yield* logInfo("Identity candidate found", {
            source: candidate.source,
            externalId: candidate.externalId,
            email: candidate.email,
          });
        }
      }
    }

    const result: IngestionResult = {
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

    return result;
  });

const extractExternalEventId = (
  payload: unknown,
  source: string
): string => {
  const p = payload as Record<string, unknown>;
  if (source === "git") {
    if (typeof p.id === "string") return p.id;
    if (typeof p.sha === "string") return p.sha;
    const headCommit = p.head_commit as Record<string, unknown> | undefined;
    if (headCommit && typeof headCommit.id === "string") return headCommit.id;
  }
  if (source === "plane") {
    if (typeof p.id === "string") return p.id;
  }
  if (source === "discord") {
    if (typeof p.id === "string") return p.id;
  }
  return JSON.stringify(payload).slice(0, 64);
};
