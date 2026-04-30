import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitIdentities } from "../src/identity-extractor";
import type { GitPullRequestPayload, GitPushPayload } from "../src/types";

const pushPayload: GitPushPayload = {
  ref: "refs/heads/main",
  before: "abc",
  after: "def",
  repository: {
    id: 1,
    full_name: "org/repo",
    html_url: "https://github.com/org/repo",
  },
  sender: {
    id: 42,
    login: "jane-dev",
    avatar_url: "https://github.com/avatar.png",
  },
  commits: [
    {
      id: "sha1",
      message: "fix bug",
      timestamp: "2026-04-30T10:00:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["a.ts"],
      removed: [],
    },
    {
      id: "sha2",
      message: "another fix",
      timestamp: "2026-04-30T10:05:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["b.ts"],
      removed: [],
    },
  ],
};

const prMergedPayload: GitPullRequestPayload = {
  action: "closed",
  number: 1,
  pull_request: {
    id: 10,
    number: 1,
    title: "Fix bug",
    body: null,
    state: "closed",
    html_url: "https://github.com/org/repo/pull/1",
    branch: "fix/bug",
    user: { id: 42, login: "jane-dev" },
    merged: true,
    merged_by: { id: 99, login: "reviewer" },
    created_at: "2026-04-30T09:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
  },
  repository: {
    id: 1,
    full_name: "org/repo",
    html_url: "https://github.com/org/repo",
  },
  sender: { id: 42, login: "jane-dev" },
};

describe("extractGitIdentities", () => {
  it("extracts sender and author identities from push", async () => {
    const result = await Effect.runPromise(extractGitIdentities(pushPayload));
    expect(result.length).toBeGreaterThanOrEqual(2);

    const sender = result.find((c) => c.externalId === "42");
    expect(sender).toBeDefined();
    expect(sender?.username).toBe("jane-dev");

    const author = result.find((c) => c.email === "jane@example.com");
    expect(author).toBeDefined();
    expect(author?.displayName).toBe("Jane Doe");
  });

  it("deduplicates same author across commits", async () => {
    const result = await Effect.runPromise(extractGitIdentities(pushPayload));
    const emailIdentities = result.filter(
      (c) => c.email === "jane@example.com"
    );
    expect(emailIdentities).toHaveLength(1);
  });

  it("extracts PR author and merger", async () => {
    const result = await Effect.runPromise(
      extractGitIdentities(prMergedPayload)
    );
    expect(result).toHaveLength(2);

    const author = result.find((c) => c.externalId === "42");
    expect(author?.username).toBe("jane-dev");

    const merger = result.find((c) => c.externalId === "99");
    expect(merger?.username).toBe("reviewer");
  });

  it("fails for unknown payload", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitIdentities({ foo: "bar" }))
    );
    expect(result._tag).toBe("Left");
  });
});
