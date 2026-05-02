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
      extractGitIdentities(sampleEnvelope)
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
      Effect.either(extractGitIdentities({ unknown: true }))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain(
        "Cannot extract identities from unknown payload type"
      );
    }
  });
});
