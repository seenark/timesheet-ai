import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommitEnvelope } from "./types";

const isCommitEnvelope = (payload: unknown): payload is GitCommitEnvelope => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.commit === "object" &&
    p.commit !== null &&
    typeof p.repoName === "string"
  );
};

export const extractGitScopes = (
  rawPayload: unknown
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract scopes from unknown payload type",
          source: "git",
        })
      );
    }

    return [
      {
        externalScopeId: rawPayload.repoName,
        name: rawPayload.repoName,
        scopeType: "repo" as const,
      },
    ];
  });
