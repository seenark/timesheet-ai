import type { Source } from "@timesheet-ai/domain";
import type {
  IngestionPlugin,
  IngestionResult,
} from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import {
  cloneOrFetch,
  getCommitDiff,
  getCommitLog,
  getRepoName,
} from "./git-operations";
import { extractGitIdentities } from "./identity-extractor";
import { normalizeGitPayload } from "./normalizer";
import { extractGitScopes } from "./scope-extractor";
import type { GitCommitEnvelope, GitConfig } from "./types";

const GIT_SOURCE: Source = "git";

export const GitIngestionPlugin: IngestionPlugin = {
  source: GIT_SOURCE,

  normalize: normalizeGitPayload,

  extractIdentities: extractGitIdentities,

  extractScopes: extractGitScopes,

  sync: (
    connectionId: string,
    cursor?: string
  ): Effect.Effect<IngestionResult, IngestionError> =>
    Effect.gen(function* () {
      let config: GitConfig;
      try {
        config = JSON.parse(connectionId) as GitConfig;
      } catch {
        return yield* Effect.fail(
          new IngestionError({
            message: `Invalid Git connection config: ${connectionId}`,
            source: "git",
          })
        );
      }

      yield* cloneOrFetch(config);

      const commits = yield* getCommitLog(config, cursor);

      if (commits.length === 0) {
        return {
          cursor: cursor ?? "",
          errors: [],
          newIdentityCandidates: 0,
          normalizedEventCount: 0,
          rawPayloadCount: 0,
        };
      }

      const repoName = getRepoName(config.repoUrl);
      let normalizedEventCount = 0;
      let newIdentityCandidates = 0;
      const errors: IngestionError[] = [];

      for (const commit of commits) {
        const diff = yield* getCommitDiff(
          config.localPath,
          commit.hash,
          commit.parentCount
        );

        const branch = commit.refNames
          .find((r) => r.startsWith("origin/"))
          ?.replace("origin/", "")
          ?.replace(" -> ", "");

        const envelope: GitCommitEnvelope = {
          commit: {
            authorEmail: commit.authorEmail,
            authorName: commit.authorName,
            branch,
            date: commit.authorDate,
            hash: commit.hash,
            message: commit.body
              ? `${commit.subject}\n\n${commit.body}`
              : commit.subject,
            parentCount: commit.parentCount,
          },
          diff,
          repoName,
        };

        const normResult = yield* Effect.either(normalizeGitPayload(envelope));
        if (normResult._tag === "Right") {
          normalizedEventCount += normResult.right.length;
        } else {
          errors.push(normResult.left);
        }

        const idResult = yield* Effect.either(extractGitIdentities(envelope));
        if (idResult._tag === "Right") {
          newIdentityCandidates += idResult.right.length;
        }
      }

      const newCursor = commits[0]?.hash ?? cursor ?? "";

      return {
        cursor: newCursor,
        errors,
        newIdentityCandidates,
        normalizedEventCount,
        rawPayloadCount: commits.length,
      };
    }),
};
