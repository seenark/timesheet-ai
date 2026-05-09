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
    const result = await Effect.runPromise(normalizeGitPayload(sampleEnvelope));

    expect(result).toHaveLength(1);

    const event = result[0];
    expect(event.source).toBe("git");
    expect(event.sourceEventType).toBe("commit");
    expect(event.eventTime).toBe("2026-04-30T10:00:00+00:00");
    expect(event.content.title).toBe("Fix login token refresh");
    expect(event.content.message).toBe(
      "Fix login token refresh\n\nToken refresh was failing on expiry."
    );
    expect(event.content.commitSha).toBe(
      "a1b2c3d4e5f6789012345678901234567890abc"
    );
    expect(event.content.branch).toBe("main");
    expect(event.content.fileCount).toBe(3);
    expect(event.content.additions).toBe(45);
    expect(event.content.deletions).toBe(12);
    expect(event.externalIdentityId).toBe("john@example.com");
    expect(event.sourceRef.externalEventId).toBe(
      "a1b2c3d4e5f6789012345678901234567890abc"
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

    const result = await Effect.runPromise(normalizeGitPayload(mergeEnvelope));

    expect(result[0].sourceEventType).toBe("merge");
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

  it("handles commit with empty branch", async () => {
    const noBranchEnvelope: GitCommitEnvelope = {
      ...sampleEnvelope,
      commit: {
        ...sampleEnvelope.commit,
        branch: undefined,
      },
    };

    const result = await Effect.runPromise(
      normalizeGitPayload(noBranchEnvelope)
    );

    expect(result[0].content.branch).toBeUndefined();
  });
});
