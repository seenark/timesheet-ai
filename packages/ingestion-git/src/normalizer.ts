import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommit, GitPullRequestPayload, GitPushPayload } from "./types";

const GIT_SOURCE: Source = "git";

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

const normalizeCommit = (
  commit: GitCommit,
  pushPayload: GitPushPayload
): Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> => ({
  source: GIT_SOURCE,
  sourceEventType: "commit",
  eventTime: commit.timestamp,
  sourceRef: {
    connectionId: "",
    externalEventId: commit.id,
    externalScopeId: pushPayload.repository.full_name,
    externalUrl: `${pushPayload.repository.html_url}/commit/${commit.id}`,
  },
  content: {
    message: commit.message,
    commitSha: commit.id,
    branch: pushPayload.ref.replace("refs/heads/", ""),
    fileCount:
      commit.added.length + commit.modified.length + commit.removed.length,
    additions: commit.added.length,
    deletions: commit.removed.length,
    title: commit.message.split("\n")[0],
  },
  attribution: {
    attributionMethod: "direct",
  },
  processingVersion: 1,
});

const normalizePullRequest = (
  payload: GitPullRequestPayload
): Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> => ({
  source: GIT_SOURCE,
  sourceEventType: `pr.${payload.action}`,
  eventTime: payload.pull_request.updated_at,
  sourceRef: {
    connectionId: "",
    externalEventId: `pr-${payload.pull_request.id}-${payload.action}`,
    externalScopeId: payload.repository.full_name,
    externalUrl: payload.pull_request.html_url,
  },
  content: {
    title: payload.pull_request.title,
    body: payload.pull_request.body ?? undefined,
    branch: payload.pull_request.branch,
    tags: [payload.pull_request.state],
  },
  attribution: {
    attributionMethod: "direct",
  },
  processingVersion: 1,
});

export const normalizeGitPayload = (
  rawPayload: unknown
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (isPushPayload(rawPayload)) {
      const events: NormalizedEvent[] = rawPayload.commits.map(
        (commit) => normalizeCommit(commit, rawPayload) as NormalizedEvent
      );
      return events;
    }

    if (isPullRequestPayload(rawPayload)) {
      const event = normalizePullRequest(rawPayload) as NormalizedEvent;
      return [event];
    }

    return yield* Effect.fail(
      new IngestionError({
        message: "Unknown Git payload type",
        source: "git",
      })
    );
  });
