import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractPlaneScopes } from "../src/scope-extractor";
import type { PlaneIssueEnvelope } from "../src/types";

const envelope: PlaneIssueEnvelope = {
  issue: {
    id: "issue-1",
    sequence_id: 1,
    name: "Test",
    description_html: "",
    created_at: "2026-04-30T10:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
    created_by: "user-1",
    assignees: [],
    state: { id: "s1", name: "Open", group: "started" },
    labels: [],
    url: "https://plane.example.com/ws/proj/issues/1",
    project: "proj-1",
    workspace__slug: "my-workspace",
    project_detail: {
      id: "proj-1",
      name: "Client Portal",
      slug: "client-portal",
    },
  },
  activities: [],
  comments: [],
};

describe("extractPlaneScopes", () => {
  it("extracts board scope from issue envelope", async () => {
    const result = await Effect.runPromise(extractPlaneScopes(envelope));
    expect(result).toHaveLength(1);
    expect(result[0].scopeType).toBe("board");
    expect(result[0].externalScopeId).toBe("my-workspace/client-portal");
    expect(result[0].name).toBe("Client Portal");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractPlaneScopes({ random: true }))
    );
    expect(result._tag).toBe("Left");
  });
});
