import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
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

export const extractGitIdentities = (
  rawPayload: unknown
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract identities from unknown payload type",
          source: "git",
        })
      );
    }

    const { authorEmail, authorName } = rawPayload.commit;

    return [
      {
        displayName: authorName,
        email: authorEmail,
        externalId: authorEmail,
        source: "git",
        username: authorEmail.split("@")[0],
      },
    ];
  });
