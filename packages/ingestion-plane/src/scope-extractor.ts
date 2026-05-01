import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { PlaneIssueEnvelope } from "./types";

const isIssueEnvelope = (payload: unknown): payload is PlaneIssueEnvelope => {
  const p = payload as Record<string, unknown>;
  if (typeof p !== "object" || p === null) {
    return false;
  }
  if (typeof p.issue !== "object" || p.issue === null) {
    return false;
  }
  const issue = p.issue as Record<string, unknown>;
  return (
    Array.isArray(issue.assignees) &&
    Array.isArray(p.activities) &&
    Array.isArray(p.comments)
  );
};

export const extractPlaneScopes = (
  rawPayload: unknown
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isIssueEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract scopes from unknown Plane payload type",
          source: "plane",
        })
      );
    }

    return [
      {
        externalScopeId: `${rawPayload.issue.workspace__slug}/${rawPayload.issue.project_detail.slug}`,
        name: rawPayload.issue.project_detail.name,
        scopeType: "board" as const,
      },
    ];
  });
