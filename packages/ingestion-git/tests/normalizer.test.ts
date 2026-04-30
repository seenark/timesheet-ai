import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizeGitPayload } from "../src/normalizer";
import type { GitPullRequestPayload, GitPushPayload } from "../src/types";

const pushPayload: GitPushPayload = {
  ref: "refs/heads/main",
  before: "abc",
  after: "def",
  repository: {
    id: 1,
    full_name: "org/client-portal",
    html_url: "https://github.com/org/client-portal",
  },
  sender: {
    id: 42,
    login: "jane-dev",
    avatar_url: "https://github.com/avatar.png",
  },
  commits: [
    {
      id: "sha123",
      message: "fix: auth token refresh\n\nDetailed description here",
      timestamp: "2026-04-30T10:05:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: ["src/auth.ts"],
      modified: ["src/token.ts"],
      removed: ["src/old-auth.ts"],
    },
    {
      id: "sha456",
      message: "chore: update deps",
      timestamp: "2026-04-30T10:10:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["package.json"],
      removed: [],
    },
  ],
};

const prPayload: GitPullRequestPayload = {
  action: "opened",
  number: 15,
  pull_request: {
    id: 999,
    number: 15,
    title: "Fix auth token refresh",
    body: "This PR fixes the token refresh issue.",
    state: "open",
    html_url: "https://github.com/org/client-portal/pull/15",
    branch: "fix/auth-refresh",
    user: { id: 42, login: "jane-dev" },
    merged: false,
    created_at: "2026-04-30T09:00:00Z",
    updated_at: "2026-04-30T09:00:00Z",
  },
  repository: {
    id: 1,
    full_name: "org/client-portal",
    html_url: "https://github.com/org/client-portal",
  },
  sender: { id: 42, login: "jane-dev" },
};

describe("normalizeGitPayload", () => {
  it("normalizes a push payload into commit events", async () => {
    const result = await Effect.runPromise(normalizeGitPayload(pushPayload));
    expect(result).toHaveLength(2);

    const first = result[0];
    expect(first.source).toBe("git");
    expect(first.sourceEventType).toBe("commit");
    expect(first.eventTime).toBe("2026-04-30T10:05:00Z");
    expect(first.content.message).toBe(
      "fix: auth token refresh\n\nDetailed description here"
    );
    expect(first.content.commitSha).toBe("sha123");
    expect(first.content.branch).toBe("main");
    expect(first.content.fileCount).toBe(3);
    expect(first.content.additions).toBe(1);
    expect(first.content.deletions).toBe(1);
    expect(first.sourceRef.externalScopeId).toBe("org/client-portal");
    expect(first.content.title).toBe("fix: auth token refresh");
  });

  it("normalizes a pull request payload", async () => {
    const result = await Effect.runPromise(normalizeGitPayload(prPayload));
    expect(result).toHaveLength(1);

    const event = result[0];
    expect(event.source).toBe("git");
    expect(event.sourceEventType).toBe("pr.opened");
    expect(event.content.title).toBe("Fix auth token refresh");
    expect(event.content.body).toBe("This PR fixes the token refresh issue.");
    expect(event.content.branch).toBe("fix/auth-refresh");
    expect(event.sourceRef.externalUrl).toBe(
      "https://github.com/org/client-portal/pull/15"
    );
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(normalizeGitPayload({ unknown: true }))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Unknown Git payload type");
    }
  });
});
