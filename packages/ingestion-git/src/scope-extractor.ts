import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitPullRequestPayload, GitPushPayload } from "./types";

const isPushPayload = (payload: unknown): payload is GitPushPayload => {
  const p = payload as Record<string, unknown>;
  return Array.isArray(p.commits) && typeof p.ref === "string";
};

const isPullRequestPayload = (
  payload: unknown
): payload is GitPullRequestPayload => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p.action === "string" &&
    typeof p.pull_request === "object" &&
    p.pull_request !== null
  );
};

export const extractGitScopes = (
  rawPayload: unknown
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (isPushPayload(rawPayload)) {
      return [
        {
          externalScopeId: rawPayload.repository.full_name,
          name: rawPayload.repository.full_name,
          scopeType: "repo" as const,
        },
      ];
    }

    if (isPullRequestPayload(rawPayload)) {
      return [
        {
          externalScopeId: rawPayload.repository.full_name,
          name: rawPayload.repository.full_name,
          scopeType: "repo" as const,
        },
      ];
    }

    return yield* Effect.fail(
      new IngestionError({
        message: "Cannot extract scopes from unknown payload type",
        source: "git",
      })
    );
  });
