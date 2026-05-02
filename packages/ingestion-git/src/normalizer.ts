import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommitEnvelope } from "./types";

const GIT_SOURCE: Source = "git";

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

const buildExternalUrl = (repoName: string, hash: string): string | undefined =>
  `https://github.com/${repoName}/commit/${hash}`;

export const normalizeGitPayload = (
  rawPayload: unknown
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Unknown Git payload type",
          source: "git",
        })
      );
    }

    const { commit, diff, repoName } = rawPayload;

    const isMerge = commit.parentCount > 1;

    const event: Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> =
      {
        source: GIT_SOURCE,
        sourceEventType: isMerge ? "merge" : "commit",
        eventTime: commit.date,
        content: {
          message: commit.message,
          title: commit.message.split("\n")[0],
          commitSha: commit.hash,
          branch: commit.branch,
          fileCount: diff.filesChanged,
          additions: diff.insertions,
          deletions: diff.deletions,
        },
        externalIdentityId: commit.authorEmail,
        sourceRef: {
          connectionId: "",
          externalEventId: commit.hash,
          externalScopeId: repoName,
          externalUrl: buildExternalUrl(repoName, commit.hash),
        },
        attribution: {
          attributionMethod: "direct",
        },
        processingVersion: 1,
      };

    return [event] as NormalizedEvent[];
  });
