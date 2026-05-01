import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizePlanePayload } from "../src/normalizer";
import type {
  PlaneActivity,
  PlaneComment,
  PlaneIssue,
  PlaneIssueEnvelope,
} from "../src/types";

const sampleIssue: PlaneIssue = {
  id: "issue-uuid-1",
  sequence_id: 142,
  name: "Fix login token refresh",
  description_html: "<p>Token refresh fails on expiry</p>",
  created_at: "2026-04-30T10:00:00Z",
  updated_at: "2026-04-30T11:00:00Z",
  created_by: "user-uuid-1",
  assignees: ["user-uuid-1"],
  state: { id: "state-1", name: "In Progress", group: "started" },
  labels: [{ id: "label-1", name: "bug" }],
  url: "https://plane.example.com/workspace/proj/issues/142",
  project: "project-uuid-1",
  workspace__slug: "my-workspace",
  project_detail: { id: "project-uuid-1", name: "Client Portal", slug: "client-portal" },
};

const sampleActivity: PlaneActivity = {
  id: "activity-uuid-1",
  created_at: "2026-04-30T10:30:00Z",
  updated_at: "2026-04-30T10:30:00Z",
  verb: "updated",
  field: "state",
  old_value: "backlog",
  new_value: "in progress",
  actor: "user-uuid-1",
  issue: "issue-uuid-1",
};

const sampleComment: PlaneComment = {
  id: "comment-uuid-1",
  created_at: "2026-04-30T10:45:00Z",
  updated_at: "2026-04-30T10:45:00Z",
  comment_html: "<p>Root cause identified in auth module</p>",
  actor: "user-uuid-1",
  issue: "issue-uuid-1",
};

describe("normalizePlanePayload", () => {
  it("normalizes a Plane issue envelope into events", async () => {
    const envelope: PlaneIssueEnvelope = {
      issue: sampleIssue,
      activities: [sampleActivity],
      comments: [sampleComment],
    };
    const result = await Effect.runPromise(normalizePlanePayload(envelope));
    expect(result.length).toBeGreaterThanOrEqual(1);

    const issueEvent = result.find((e) => e.sourceEventType === "issue.updated");
    expect(issueEvent).toBeDefined();
    expect(issueEvent!.source).toBe("plane");
    expect(issueEvent!.content.title).toBe("Fix login token refresh");
    expect(issueEvent!.content.taskId).toBe("142");
    expect(issueEvent!.content.taskStatus).toBe("In Progress");
    expect(issueEvent!.sourceRef.externalScopeId).toBe("my-workspace/client-portal");
  });

  it("normalizes a status change activity", async () => {
    const envelope: PlaneIssueEnvelope = {
      issue: sampleIssue,
      activities: [sampleActivity],
      comments: [],
    };
    const result = await Effect.runPromise(normalizePlanePayload(envelope));
    const statusEvent = result.find((e) => e.sourceEventType === "issue.status_changed");
    expect(statusEvent).toBeDefined();
    expect(statusEvent!.content.taskStatus).toBe("in progress");
  });

  it("normalizes a comment", async () => {
    const envelope: PlaneIssueEnvelope = {
      issue: sampleIssue,
      activities: [],
      comments: [sampleComment],
    };
    const result = await Effect.runPromise(normalizePlanePayload(envelope));
    const commentEvent = result.find((e) => e.sourceEventType === "issue.comment_added");
    expect(commentEvent).toBeDefined();
    expect(commentEvent!.content.body).toBe("<p>Root cause identified in auth module</p>");
  });

  it("normalizes a new issue", async () => {
    const envelope: PlaneIssueEnvelope = {
      issue: { ...sampleIssue, created_at: sampleIssue.updated_at },
      activities: [],
      comments: [],
    };
    const result = await Effect.runPromise(normalizePlanePayload(envelope));
    const createdEvent = result.find((e) => e.sourceEventType === "issue.created");
    expect(createdEvent).toBeDefined();
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(normalizePlanePayload({ unknown: true }))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Unknown Plane payload type");
    }
  });
});