import type { Source } from "@timesheet-ai/domain";
import type {
  IngestionPlugin,
  IngestionResult,
} from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import { buildIssueEnvelopes, fetchIssuesSince } from "./api-client";
import { extractPlaneIdentities } from "./identity-extractor";
import { normalizePlanePayload } from "./normalizer";
import { extractPlaneScopes } from "./scope-extractor";
import type { PlaneConfig } from "./types";

const PLANE_SOURCE: Source = "plane";

export const PlaneIngestionPlugin: IngestionPlugin = {
  source: PLANE_SOURCE,

  normalize: normalizePlanePayload,

  extractIdentities: extractPlaneIdentities,

  extractScopes: extractPlaneScopes,

  sync: (
    connectionId: string,
    cursor?: string
  ): Effect.Effect<IngestionResult, IngestionError> =>
    Effect.gen(function* () {
      let config: PlaneConfig;
      try {
        config = JSON.parse(connectionId) as PlaneConfig;
      } catch {
        return yield* Effect.fail(
          new IngestionError({
            message: `Invalid Plane connection config: ${connectionId}`,
            source: "plane",
          })
        );
      }

      try {
        const issues = yield* Effect.promise(() =>
          fetchIssuesSince(config, cursor)
        );

        if (issues.length === 0) {
          return {
            cursor: cursor ?? new Date().toISOString(),
            errors: [],
            newIdentityCandidates: 0,
            normalizedEventCount: 0,
            rawPayloadCount: 0,
          };
        }

        const envelopes = yield* Effect.promise(() =>
          buildIssueEnvelopes(config, issues)
        );

        const newCursor = issues.reduce(
          (latest, issue) =>
            issue.updated_at > latest ? issue.updated_at : latest,
          issues[0]?.updated_at ?? ""
        );

        let normalizedEventCount = 0;
        let newIdentityCandidates = 0;
        const errors: IngestionError[] = [];

        for (const envelope of envelopes) {
          const normResult = yield* Effect.either(
            normalizePlanePayload(envelope)
          );
          if (normResult._tag === "Right") {
            normalizedEventCount += normResult.right.length;
          } else {
            errors.push(normResult.left);
          }

          const idResult = yield* Effect.either(
            extractPlaneIdentities(envelope)
          );
          if (idResult._tag === "Right") {
            newIdentityCandidates += idResult.right.length;
          }
        }

        return {
          cursor: newCursor,
          errors,
          newIdentityCandidates,
          normalizedEventCount,
          rawPayloadCount: issues.length,
        };
      } catch (error) {
        return yield* Effect.fail(
          new IngestionError({
            message: `Plane sync failed: ${String(error)}`,
            source: "plane",
          })
        );
      }
    }),
};
