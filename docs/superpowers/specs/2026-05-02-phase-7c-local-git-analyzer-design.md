# Phase 7C: Local Git Analyzer — Design Spec

## Overview

Replace the webhook-based `ingestion-git` plugin with a local git repository analyzer. Instead of receiving push/PR events from GitHub webhooks, the worker clones/fetches repos to local disk and parses `git log` to extract commits, authors, and file changes.

## Decisions

- **No platform dependency**: No GitHub/GitLab APIs, no webhooks — just git CLI
- **Local filesystem clones**: Bare clones stored in a configurable data directory
- **Bun.spawn for git operations**: Zero external dependencies — uses git CLI directly
- **Commits only**: No PR-specific events; merge commits detected via 2+ parents
- **Incremental sync**: Uses commit hash as cursor per repo
- **Full replacement**: Removes webhook endpoint and rewrites ingestion-git entirely

## Package Structure

Replaces contents of `packages/ingestion-git/`:

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Git config, commit envelope, git CLI output types |
| `src/git-operations.ts` | Clone, fetch, log, diff via Bun.spawn |
| `src/normalizer.ts` | GitCommitEnvelope → NormalizedEvent[] |
| `src/identity-extractor.ts` | Extract author identity from commits |
| `src/scope-extractor.ts` | Extract repo scope |
| `src/plugin.ts` | GitIngestionPlugin implementing IngestionPlugin |
| `src/index.ts` | Barrel exports |

Additionally removes: `apps/server/src/routes/webhooks.ts` git webhook endpoint.

## Configuration

```ts
interface GitConfig {
  readonly repoUrl: string;
  readonly localPath: string;
  readonly branch?: string;
  readonly authToken?: string;
}
```

Stored as JSON in `integration_connection.config`, parsed from `connectionId` in `sync()`.

## Git Operations Module

`git-operations.ts` wraps all git CLI interactions:

### `cloneOrFetch(config)`

- If `localPath` doesn't exist: `git clone --bare <repoUrl> <localPath>`
- If exists: `git fetch --all`
- Handles auth by embedding token in URL when `authToken` is provided
- Returns Effect for error handling

### `getCommitLog(config, sinceHash?)`

- `git log --format=<structured> --after=<sinceHash> --all`
- Format: `HASH%n%AUTHOR_NAME%n%AUTHOR_EMAIL%n%AUTHOR_DATE%n%SUBJECT%n%BODY%n%PARENT_COUNT%n%REF_NAMES`
- Parses output into structured `RawCommit[]`
- If `branch` is specified, filters to that branch

### `getCommitDiff(localPath, hash)`

- `git diff --stat <hash>^..<hash>`
- Parses output to extract: files changed, insertions, deletions
- For merge commits (2+ parents): `git diff --stat <hash>^1..<hash>`

## Raw Types

```ts
interface RawCommit {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly subject: string;
  readonly body: string;
  readonly parentCount: number;
  readonly refNames: readonly string[];
}

interface CommitDiff {
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
}

interface GitCommitEnvelope {
  readonly repoName: string;
  readonly commit: {
    readonly hash: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly date: string;
    readonly message: string;
    readonly parentCount: number;
    readonly branch?: string;
  };
  readonly diff: {
    readonly filesChanged: number;
    readonly insertions: number;
    readonly deletions: number;
  };
}
```

## Normalization

### GitCommitEnvelope to NormalizedEvent Mapping

| NormalizedEvent field | Git source |
|----------------------|------------|
| `source` | `"git"` |
| `sourceEventType` | `"commit"` (or `"merge"` if parentCount > 1) |
| `eventTime` | commit date |
| `content.message` | full commit message (subject + body) |
| `content.title` | commit subject (first line) |
| `content.commitSha` | commit hash |
| `content.branch` | branch name from refNames |
| `content.fileCount` | diff.filesChanged |
| `content.additions` | diff.insertions |
| `content.deletions` | diff.deletions |
| `externalIdentityId` | author email |
| `sourceRef.externalEventId` | commit hash |
| `sourceRef.externalScopeId` | repo name |
| `sourceRef.externalUrl` | `{repoUrl}/commit/{hash}` (HTTPS URLs only; SSH URLs get no externalUrl) |

## Identity Extraction

One identity per commit author:

```ts
{
  externalId: commit.authorEmail,
  email: commit.authorEmail,
  displayName: commit.authorName,
  username: commit.authorEmail.split("@")[0],
  source: "git"
}
```

Duplicate authors are deduplicated per envelope batch.

## Scope Extraction

One scope per commit:

```ts
{
  externalScopeId: repoName,
  name: repoName,
  scopeType: "repo" as const
}
```

## sync() Method

1. Parse `GitConfig` from `connectionId`
2. Call `cloneOrFetch(config)` to ensure local clone is up to date
3. Call `getCommitLog(config, cursor)` to get new commits since last sync
4. For each commit: call `getCommitDiff(localPath, hash)` to get file stats
5. Build `GitCommitEnvelope` for each commit
6. Run through normalize/extract pipeline
7. Return `IngestionResult` with new cursor (latest hash)

Cursor format: commit hash string (e.g., `"a1b2c3d4e5f6..."`)

## Server Cleanup

Remove the git webhook endpoint from `apps/server/src/routes/webhooks.ts`. The server route file can be emptied or repurposed for future webhook-based sources.

## Worker Changes

- `GitIngestionPlugin` already registered in `apps/worker/src/index.ts`
- No new registration needed — same source name `"git"`, same plugin name

## Testing Strategy

- **git-operations.test.ts**: Test git log parsing, diff parsing (with mock CLI output)
- **normalizer.test.ts**: Test commit normalization, merge commit detection
- **identity-extractor.test.ts**: Test author extraction, deduplication
- **scope-extractor.test.ts**: Test repo scope extraction

## Dependencies

- `@timesheet-ai/domain` — types
- `@timesheet-ai/ingestion-core` — IngestionPlugin interface
- `@timesheet-ai/shared` — shared utilities
- `effect` — Effect-TS core
- No new external dependencies — uses git CLI via Bun.spawn
