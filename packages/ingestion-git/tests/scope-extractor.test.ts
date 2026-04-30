import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitScopes } from "../src/scope-extractor";
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
  commits: [],
};

const prPayload: GitPullRequestPayload = {
  action: "opened",
  number: 5,
  pull_request: {
    id: 100,
    number: 5,
    title: "Feature X",
    body: null,
    state: "open",
    html_url: "https://github.com/org/client-portal/pull/5",
    branch: "feature/x",
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

describe("extractGitScopes", () => {
  it("extracts repo scope from push payload", async () => {
    const result = await Effect.runPromise(extractGitScopes(pushPayload));
    expect(result).toHaveLength(1);
    expect(result[0].scopeType).toBe("repo");
    expect(result[0].externalScopeId).toBe("org/client-portal");
    expect(result[0].name).toBe("org/client-portal");
  });

  it("extracts repo scope from PR payload", async () => {
    const result = await Effect.runPromise(extractGitScopes(prPayload));
    expect(result).toHaveLength(1);
    expect(result[0].externalScopeId).toBe("org/client-portal");
  });

  it("fails for unknown payload", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitScopes({ random: true }))
    );
    expect(result._tag).toBe("Left");
  });
});
