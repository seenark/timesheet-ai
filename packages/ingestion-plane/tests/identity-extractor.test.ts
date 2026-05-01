import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractPlaneIdentities } from "../src/identity-extractor";
import type { PlaneIssueEnvelope } from "../src/types";

const envelope: PlaneIssueEnvelope = {
  issue: {
    id: "issue-1",
    sequence_id: 1,
    name: "Test",
    description_html: "",
    created_at: "2026-04-30T10:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
    created_by: "user-uuid-1",
    assignees: ["user-uuid-1", "user-uuid-2"],
    state: { id: "s1", name: "Open", group: "started" },
    labels: [],
    url: "https://plane.example.com/ws/proj/issues/1",
    project: "proj-1",
    workspace__slug: "ws",
    project_detail: { id: "proj-1", name: "P", slug: "p" },
  },
  activities: [
    {
      id: "act-1",
      created_at: "2026-04-30T10:30:00Z",
      updated_at: "2026-04-30T10:30:00Z",
      verb: "updated",
      field: "state",
      old_value: null,
      new_value: "in progress",
      actor: "user-uuid-3",
      issue: "issue-1",
    },
  ],
  comments: [
    {
      id: "cmt-1",
      created_at: "2026-04-30T10:45:00Z",
      updated_at: "2026-04-30T10:45:00Z",
      comment_html: "Done",
      actor: "user-uuid-1",
      issue: "issue-1",
    },
  ],
};

describe("extractPlaneIdentities", () => {
  it("extracts identities from issue creator, assignees, activity actors, and comment actors", async () => {
    const result = await Effect.runPromise(extractPlaneIdentities(envelope));
    const ids = result.map((c) => c.externalId);
    expect(ids).toContain("user-uuid-1");
    expect(ids).toContain("user-uuid-2");
    expect(ids).toContain("user-uuid-3");
  });

  it("deduplicates identities", async () => {
    const result = await Effect.runPromise(extractPlaneIdentities(envelope));
    const uuid1Count = result.filter((c) => c.externalId === "user-uuid-1").length;
    expect(uuid1Count).toBe(1);
  });

  it("sets source to plane for all candidates", async () => {
    const result = await Effect.runPromise(extractPlaneIdentities(envelope));
    expect(result.every((c) => c.source === "plane")).toBe(true);
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractPlaneIdentities({ random: true }))
    );
    expect(result._tag).toBe("Left");
  });
});
