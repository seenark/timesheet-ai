# Phase 7C: Local Git Analyzer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the webhook-based `ingestion-git` with a local git repository analyzer that clones/fetches repos and parses git log to extract commits.

**Architecture:** The plugin uses `Bun.spawn` to call git CLI for clone, fetch, log, and diff operations. Commits are parsed from structured git log output, enriched with diff stats, and normalized into `NormalizedEvent[]`. Follows the same `IngestionPlugin` interface as ingestion-plane and ingestion-discord.

**Tech Stack:** Effect-TS, Bun runtime (Bun.spawn for git CLI), TypeScript, SurrealDB (via existing pipeline).

---

## File Structure

### Files to replace (delete old, write new)

| File | Responsibility |
|------|---------------|
| `packages/ingestion-git/src/types.ts` | Git config, commit envelope, raw commit types |
| `packages/ingestion-git/src/normalizer.ts` | GitCommitEnvelope → NormalizedEvent[] |
| `packages/ingestion-git/src/identity-extractor.ts` | Extract author identity from commits |
| `packages/ingestion-git/src/scope-extractor.ts` | Extract repo scope |
| `packages/ingestion-git/src/plugin.ts` | GitIngestionPlugin implementing IngestionPlugin |
| `packages/ingestion-git/src/index.ts` | Barrel exports |

### New files to create

| File | Responsibility |
|------|---------------|
| `packages/ingestion-git/src/git-operations.ts` | Clone, fetch, log, diff via Bun.spawn |
| `packages/ingestion-git/tests/normalizer.test.ts` | Normalizer tests (replace) |
| `packages/ingestion-git/tests/identity-extractor.test.ts` | Identity extractor tests (replace) |
| `packages/ingestion-git/tests/scope-extractor.test.ts` | Scope extractor tests (replace) |

### Files to modify

| File | Change |
|------|--------|
| `apps/server/src/routes/webhooks.ts` | Remove git webhook endpoint |
| `apps/server/src/routes/index.ts` | Remove webhookRoutes import if needed |

---

## Task 1: Delete Old Source Files

**Files:** Delete all files in `packages/ingestion-git/src/` and `packages/ingestion-git/tests/`

- [ ] **Step 1: Delete old source files**

```bash
rm -rf packages/ingestion-git/src/*
rm -rf packages/ingestion-git/tests/*
```

Keep `packages/ingestion-git/package.json` and `packages/ingestion-git/tsconfig.json`.

- [ ] **Step 2: Commit**

```bash
git add -u packages/ingestion-git/
git commit -m "chore(ingestion-git): remove webhook-based implementation for local git analyzer"
```

---

## Task 2: Define Git Types

**Files:**
- Create: `packages/ingestion-git/src/types.ts`

- [ ] **Step 1: Create `packages/ingestion-git/src/types.ts`**

```ts
export interface GitConfig {
  readonly authToken?: string;
  readonly branch?: string;
  readonly localPath: string;
  readonly repoUrl: string;
}

export interface RawCommit {
  readonly authorDate: string;
  readonly authorEmail: string;
  readonly authorName: string;
  readonly body: string;
  readonly hash: string;
  readonly parentCount: number;
  readonly refNames: readonly string[];
  readonly subject: string;
}

export interface CommitDiff {
  readonly deletions: number;
  readonly filesChanged: number;
  readonly insertions: number;
}

export interface GitCommitEnvelope {
  readonly commit: {
    readonly authorEmail: string;
    readonly authorName: string;
    readonly branch?: string;
    readonly date: string;
    readonly hash: string;
    readonly message: string;
    readonly parentCount: number;
  };
  readonly diff: {
    readonly deletions: number;
    readonly filesChanged: number;
    readonly insertions: number;
  };
  readonly repoName: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ingestion-git/src/types.ts
git commit -m "feat(ingestion-git): add local git analyzer types"
```

---

## Task 3: Write Git Operations Module

**Files:**
- Create: `packages/ingestion-git/src/git-operations.ts`

- [ ] **Step 1: Create `packages/ingestion-git/src/git-operations.ts`**

```ts
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { CommitDiff, GitConfig, RawCommit } from "./types";

const GIT_LOG_FORMAT =
  "%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%P%x00%D%x00%x01";

const execGit = async (
  args: readonly string[],
  cwd?: string,
): Promise<string> => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`);
  }

  return stdout;
};

const buildAuthUrl = (url: string, token?: string): string => {
  if (!token) return url;
  if (url.startsWith("https://")) {
    return url.replace("https://", `https://${token}@`);
  }
  return url;
};

const extractRepoName = (url: string): string => {
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? url;
};

export const cloneOrFetch = (
  config: GitConfig,
): Effect.Effect<void, IngestionError> =>
  Effect.tryPromise({
    catch: (error) =>
      new IngestionError({
        message: `Git clone/fetch failed: ${String(error)}`,
        source: "git",
      }),
    try: async () => {
      const authUrl = buildAuthUrl(config.repoUrl, config.authToken);

      try {
        await execGit(["--git-dir", config.localPath, "rev-parse", "--git-dir"]);
        await execGit(["--git-dir", config.localPath, "fetch", "--all"]);
      } catch {
        await execGit(["clone", "--bare", authUrl, config.localPath]);
      }
    },
  });

export const getCommitLog = (
  config: GitConfig,
  sinceHash?: string,
): Effect.Effect<readonly RawCommit[], IngestionError> =>
  Effect.tryPromise({
    catch: (error) =>
      new IngestionError({
        message: `Git log failed: ${String(error)}`,
        source: "git",
      }),
    try: async () => {
      const args = [
        "--git-dir",
        config.localPath,
        "log",
        `--format=${GIT_LOG_FORMAT}`,
      ];

      if (sinceHash) {
        args.push(`${sinceHash}..HEAD`);
      }

      if (config.branch) {
        args.push(config.branch);
      } else {
        args.push("--all");
      }

      const output = await execGit(args);
      return parseLogOutput(output);
    },
  });

const parseLogOutput = (output: string): RawCommit[] => {
  if (!output.trim()) return [];

  const records = output.split("\x01").filter((r) => r.trim());
  return records.map(parseRecord).filter((c): c is RawCommit => c !== null);
};

const parseRecord = (record: string): RawCommit | null => {
  const parts = record.split("\x00");
  if (parts.length < 8) return null;

  const parentLine = parts[6]?.trim() ?? "";
  const parentCount = parentLine ? parentLine.split(" ").length : 0;

  return {
    hash: parts[0]!.trim(),
    authorName: parts[1]!.trim(),
    authorEmail: parts[2]!.trim(),
    authorDate: parts[3]!.trim(),
    subject: parts[4]!.trim(),
    body: parts[5]!.trim(),
    parentCount,
    refNames: parts[7]!.trim() ? parts[7]!.split(",").map((r) => r.trim()) : [],
  };
};

export const getCommitDiff = (
  localPath: string,
  hash: string,
  parentCount: number,
): Effect.Effect<CommitDiff, IngestionError> =>
  Effect.tryPromise({
    catch: () =>
      new IngestionError({
        message: `Git diff failed for ${hash}`,
        source: "git",
      }),
    try: async () => {
      const parentRef = parentCount > 1 ? `${hash}^1` : `${hash}^`;
      let output: string;
      try {
        output = await execGit(
          ["--git-dir", localPath, "diff", "--shortstat", parentRef, hash],
        );
      } catch {
        return { filesChanged: 0, insertions: 0, deletions: 0 };
      }
      return parseDiffStat(output);
    },
  });

const parseDiffStat = (output: string): CommitDiff => {
  const filesMatch = output.match(/(\d+) files? changed/);
  const insertionsMatch = output.match(/(\d+) insertion/);
  const deletionsMatch = output.match(/(\d+) deletion/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1]!, 10) : 0,
    insertions: insertionsMatch ? parseInt(insertionsMatch[1]!, 10) : 0,
    deletions: deletionsMatch ? parseInt(deletionsMatch[1]!, 10) : 0,
  };
};

export const getRepoName = (url: string): string => extractRepoName(url);
```

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd packages/ingestion-git check-types`

- [ ] **Step 3: Run lint**

Run: `bun x ultracite fix packages/ingestion-git/src/git-operations.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/ingestion-git/src/git-operations.ts
git commit -m "feat(ingestion-git): add git operations module with clone, fetch, log, diff"
```

---

## Task 4: Write and Test Normalizer

**Files:**
- Create: `packages/ingestion-git/tests/normalizer.test.ts`
- Create: `packages/ingestion-git/src/normalizer.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-git/tests/normalizer.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizeGitPayload } from "../src/normalizer";
import type { GitCommitEnvelope } from "../src/types";

const sampleEnvelope: GitCommitEnvelope = {
  repoName: "my-org/my-repo",
  commit: {
    hash: "a1b2c3d4e5f6789012345678901234567890abc",
    authorName: "John Doe",
    authorEmail: "john@example.com",
    date: "2026-04-30T10:00:00+00:00",
    message: "Fix login token refresh\n\nToken refresh was failing on expiry.",
    parentCount: 1,
    branch: "main",
  },
  diff: {
    filesChanged: 3,
    insertions: 45,
    deletions: 12,
  },
};

describe("normalizeGitPayload", () => {
  it("normalizes a commit envelope into an event", async () => {
    const result = await Effect.runPromise(
      normalizeGitPayload(sampleEnvelope),
    );

    expect(result).toHaveLength(1);

    const event = result[0];
    expect(event.source).toBe("git");
    expect(event.sourceEventType).toBe("commit");
    expect(event.eventTime).toBe("2026-04-30T10:00:00+00:00");
    expect(event.content.title).toBe("Fix login token refresh");
    expect(event.content.message).toBe(
      "Fix login token refresh\n\nToken refresh was failing on expiry.",
    );
    expect(event.content.commitSha).toBe(
      "a1b2c3d4e5f6789012345678901234567890abc",
    );
    expect(event.content.branch).toBe("main");
    expect(event.content.fileCount).toBe(3);
    expect(event.content.additions).toBe(45);
    expect(event.content.deletions).toBe(12);
    expect(event.externalIdentityId).toBe("john@example.com");
    expect(event.sourceRef.externalEventId).toBe(
      "a1b2c3d4e5f6789012345678901234567890abc",
    );
    expect(event.sourceRef.externalScopeId).toBe("my-org/my-repo");
  });

  it("classifies merge commits correctly", async () => {
    const mergeEnvelope: GitCommitEnvelope = {
      ...sampleEnvelope,
      commit: {
        ...sampleEnvelope.commit,
        parentCount: 2,
      },
    };

    const result = await Effect.runPromise(
      normalizeGitPayload(mergeEnvelope),
    );

    expect(result[0].sourceEventType).toBe("merge");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(normalizeGitPayload({ unknown: true })),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Unknown Git payload type");
    }
  });

  it("handles commit with empty branch", async () => {
    const noBranchEnvelope: GitCommitEnvelope = {
      ...sampleEnvelope,
      commit: {
        ...sampleEnvelope.commit,
        branch: undefined,
      },
    };

    const result = await Effect.runPromise(
      normalizeGitPayload(noBranchEnvelope),
    );

    expect(result[0].content.branch).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-git/`

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-git/src/normalizer.ts`:

```ts
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommitEnvelope } from "./types";

const GIT_SOURCE: Source = "git";

const isCommitEnvelope = (
  payload: unknown,
): payload is GitCommitEnvelope => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.commit === "object" &&
    p.commit !== null &&
    typeof p.repoName === "string"
  );
};

const buildExternalUrl = (
  repoName: string,
  hash: string,
): string | undefined => {
  return `https://github.com/${repoName}/commit/${hash}`;
};

export const normalizeGitPayload = (
  rawPayload: unknown,
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Unknown Git payload type",
          source: "git",
        }),
      );
    }

    const { commit, diff, repoName } = rawPayload;

    const isMerge = commit.parentCount > 1;

    const event: Omit<
      NormalizedEvent,
      "id" | "organizationId" | "ingestedAt"
    > = {
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
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/ingestion-git/`
Expected: 4 pass, 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-git/src/normalizer.ts packages/ingestion-git/tests/normalizer.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-git/src/normalizer.ts packages/ingestion-git/tests/normalizer.test.ts
git commit -m "feat(ingestion-git): add local git normalizer with tests"
```

---

## Task 5: Write and Test Identity Extractor

**Files:**
- Create: `packages/ingestion-git/tests/identity-extractor.test.ts`
- Create: `packages/ingestion-git/src/identity-extractor.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-git/tests/identity-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitIdentities } from "../src/identity-extractor";
import type { GitCommitEnvelope } from "../src/types";

const sampleEnvelope: GitCommitEnvelope = {
  repoName: "my-org/my-repo",
  commit: {
    hash: "a1b2c3d4",
    authorName: "John Doe",
    authorEmail: "john@example.com",
    date: "2026-04-30T10:00:00+00:00",
    message: "Fix login",
    parentCount: 1,
  },
  diff: { filesChanged: 1, insertions: 5, deletions: 2 },
};

describe("extractGitIdentities", () => {
  it("extracts identity from commit author", async () => {
    const result = await Effect.runPromise(
      extractGitIdentities(sampleEnvelope),
    );

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe("john@example.com");
    expect(result[0].email).toBe("john@example.com");
    expect(result[0].displayName).toBe("John Doe");
    expect(result[0].username).toBe("john");
    expect(result[0].source).toBe("git");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitIdentities({ unknown: true })),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Cannot extract identities from unknown payload type");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-git/`

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-git/src/identity-extractor.ts`:

```ts
import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommitEnvelope } from "./types";

const isCommitEnvelope = (
  payload: unknown,
): payload is GitCommitEnvelope => {
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
  rawPayload: unknown,
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract identities from unknown payload type",
          source: "git",
        }),
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
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/ingestion-git/`
Expected: 6 pass (4 normalizer + 2 identity), 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-git/src/identity-extractor.ts packages/ingestion-git/tests/identity-extractor.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-git/src/identity-extractor.ts packages/ingestion-git/tests/identity-extractor.test.ts
git commit -m "feat(ingestion-git): add identity extractor with tests"
```

---

## Task 6: Write and Test Scope Extractor

**Files:**
- Create: `packages/ingestion-git/tests/scope-extractor.test.ts`
- Create: `packages/ingestion-git/src/scope-extractor.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-git/tests/scope-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitScopes } from "../src/scope-extractor";
import type { GitCommitEnvelope } from "../src/types";

const sampleEnvelope: GitCommitEnvelope = {
  repoName: "my-org/my-repo",
  commit: {
    hash: "a1b2c3d4",
    authorName: "John Doe",
    authorEmail: "john@example.com",
    date: "2026-04-30T10:00:00+00:00",
    message: "Fix login",
    parentCount: 1,
  },
  diff: { filesChanged: 1, insertions: 5, deletions: 2 },
};

describe("extractGitScopes", () => {
  it("extracts repo scope", async () => {
    const result = await Effect.runPromise(
      extractGitScopes(sampleEnvelope),
    );

    expect(result).toHaveLength(1);
    expect(result[0].scopeType).toBe("repo");
    expect(result[0].externalScopeId).toBe("my-org/my-repo");
    expect(result[0].name).toBe("my-org/my-repo");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitScopes({ unknown: true })),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Cannot extract scopes from unknown payload type");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-git/`

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-git/src/scope-extractor.ts`:

```ts
import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommitEnvelope } from "./types";

const isCommitEnvelope = (
  payload: unknown,
): payload is GitCommitEnvelope => {
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
  rawPayload: unknown,
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isCommitEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract scopes from unknown payload type",
          source: "git",
        }),
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
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/ingestion-git/`
Expected: 8 pass (4 + 2 + 2), 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-git/src/scope-extractor.ts packages/ingestion-git/tests/scope-extractor.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-git/src/scope-extractor.ts packages/ingestion-git/tests/scope-extractor.test.ts
git commit -m "feat(ingestion-git): add scope extractor with tests"
```

---

## Task 7: Write Plugin + Barrel Exports

**Files:**
- Create: `packages/ingestion-git/src/plugin.ts`
- Create: `packages/ingestion-git/src/index.ts`

- [ ] **Step 1: Write the plugin**

Create `packages/ingestion-git/src/plugin.ts`:

```ts
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
    cursor?: string,
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
          }),
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
          commit.parentCount,
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

        const normResult = yield* Effect.either(
          normalizeGitPayload(envelope),
        );
        if (normResult._tag === "Right") {
          normalizedEventCount += normResult.right.length;
        } else {
          errors.push(normResult.left);
        }

        const idResult = yield* Effect.either(
          extractGitIdentities(envelope),
        );
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
```

- [ ] **Step 2: Write barrel exports**

Create `packages/ingestion-git/src/index.ts`:

```ts
export { extractGitIdentities } from "./identity-extractor";
export { normalizeGitPayload } from "./normalizer";
export { GitIngestionPlugin } from "./plugin";
export { extractGitScopes } from "./scope-extractor";
export type { GitCommitEnvelope, GitConfig } from "./types";
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/ingestion-git/`
Expected: 8 pass, 0 fail.

- [ ] **Step 4: Run typecheck**

Run: `bun run --cwd packages/ingestion-git check-types`

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-git/src/`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-git/src/plugin.ts packages/ingestion-git/src/index.ts
git commit -m "feat(ingestion-git): add GitIngestionPlugin with local git sync"
```

---

## Task 8: Remove Git Webhook Endpoint

**Files:**
- Modify: `apps/server/src/routes/webhooks.ts`
- Modify: `apps/server/src/routes/index.ts` (if needed)

- [ ] **Step 1: Replace webhooks.ts with empty routes**

Replace `apps/server/src/routes/webhooks.ts` with:

```ts
import { Elysia } from "elysia";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
});
```

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd apps/server check-types`

- [ ] **Step 3: Run lint**

Run: `bun x ultracite fix apps/server/src/routes/webhooks.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/webhooks.ts
git commit -m "chore(server): remove git webhook endpoint"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (155 total — 8 new git tests replace 5 old git tests, net +3).

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd packages/ingestion-git check-types && bun run --cwd apps/worker check-types && bun run --cwd apps/server check-types`

- [ ] **Step 3: Run lint**

Run: `bun x ultracite check packages/ingestion-git/src/ apps/worker/src/ apps/server/src/routes/`

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge phase-7c-local-git-analyzer --no-edit
git push
```
