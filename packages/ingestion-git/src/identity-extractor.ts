import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommit, GitPullRequestPayload, GitPushPayload } from "./types";

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

const deduplicateCandidates = (
  candidates: readonly ExternalIdentityCandidate[]
): ExternalIdentityCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.source}:${c.externalId}:${c.email ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const extractGitIdentities = (
  rawPayload: unknown
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    const candidates: ExternalIdentityCandidate[] = [];

    if (isPushPayload(rawPayload)) {
      if (rawPayload.sender) {
        candidates.push({
          source: "git",
          externalId: String(rawPayload.sender.id),
          username: rawPayload.sender.login,
          displayName: rawPayload.sender.login,
        });
      }

      for (const commit of rawPayload.commits as readonly GitCommit[]) {
        candidates.push({
          source: "git",
          externalId: commit.author.email,
          email: commit.author.email,
          displayName: commit.author.name,
          username: commit.author.email.split("@")[0],
        });
      }
    }

    if (isPullRequestPayload(rawPayload)) {
      candidates.push({
        source: "git",
        externalId: String(rawPayload.pull_request.user.id),
        username: rawPayload.pull_request.user.login,
        displayName: rawPayload.pull_request.user.login,
      });

      if (
        rawPayload.action === "closed" &&
        rawPayload.pull_request.merged &&
        rawPayload.pull_request.merged_by
      ) {
        candidates.push({
          source: "git",
          externalId: String(rawPayload.pull_request.merged_by.id),
          username: rawPayload.pull_request.merged_by.login,
          displayName: rawPayload.pull_request.merged_by.login,
        });
      }
    }

    if (
      candidates.length === 0 &&
      !isPushPayload(rawPayload) &&
      !isPullRequestPayload(rawPayload)
    ) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract identities from unknown payload type",
          source: "git",
        })
      );
    }

    return deduplicateCandidates(candidates);
  });
