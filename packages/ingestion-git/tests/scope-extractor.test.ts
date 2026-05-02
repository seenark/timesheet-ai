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
    const result = await Effect.runPromise(extractGitScopes(sampleEnvelope));

    expect(result).toHaveLength(1);
    expect(result[0].scopeType).toBe("repo");
    expect(result[0].externalScopeId).toBe("my-org/my-repo");
    expect(result[0].name).toBe("my-org/my-repo");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitScopes({ unknown: true }))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain(
        "Cannot extract scopes from unknown payload type"
      );
    }
  });
});
