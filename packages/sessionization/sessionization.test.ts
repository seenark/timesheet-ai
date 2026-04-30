import { describe, expect, test } from "bun:test";
import { detectClusters, detectSessions } from "./src/index";
import type { SessionInput } from "./src/types";

const makeEvent = (overrides: Partial<SessionInput> = {}): SessionInput =>
  ({
    canonicalUserId: "user-1",
    eventTime: "2024-01-15T10:00:00.000Z",
    id: "evt-1",
    organizationId: "org-1",
    projectId: "proj-1",
    source: "git",
    sourceEventType: "push",
    content: {},
    ...overrides,
  }) as SessionInput;

describe("detectSessions", () => {
  test("single event creates one session", () => {
    const events = [
      makeEvent({ id: "evt-1", eventTime: "2024-01-15T10:00:00.000Z" }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.eventIds).toEqual(["evt-1"]);
  });

  test("events within gap form one session", () => {
    const events = [
      makeEvent({ id: "evt-1", eventTime: "2024-01-15T10:00:00.000Z" }),
      makeEvent({ id: "evt-2", eventTime: "2024-01-15T10:10:00.000Z" }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.eventIds).toEqual(["evt-1", "evt-2"]);
  });

  test("events split by gap create multiple sessions", () => {
    const events = [
      makeEvent({ id: "evt-1", eventTime: "2024-01-15T10:00:00.000Z" }),
      makeEvent({ id: "evt-2", eventTime: "2024-01-15T10:35:00.000Z" }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.eventIds).toEqual(["evt-1"]);
    expect(sessions[1]?.eventIds).toEqual(["evt-2"]);
  });

  test("different users get separate sessions", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        canonicalUserId: "user-1",
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        canonicalUserId: "user-2",
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(2);
    expect(
      sessions.find((s) => s.canonicalUserId === "user-1")?.eventIds
    ).toEqual(["evt-1"]);
    expect(
      sessions.find((s) => s.canonicalUserId === "user-2")?.eventIds
    ).toEqual(["evt-2"]);
  });

  test("empty input returns empty", () => {
    const sessions = detectSessions([]);
    expect(sessions).toHaveLength(0);
  });

  test("events with same project aggregate projectIds", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-1",
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.projectIds).toEqual(["proj-1"]);
  });

  test("events with different projects aggregate all projectIds", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-2",
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.projectIds).toContain("proj-1");
    expect(sessions[0]?.projectIds).toContain("proj-2");
    expect(sessions[0]?.projectIds).toHaveLength(2);
  });

  test("custom gap config respected", () => {
    const events = [
      makeEvent({ id: "evt-1", eventTime: "2024-01-15T10:00:00.000Z" }),
      makeEvent({ id: "evt-2", eventTime: "2024-01-15T10:20:00.000Z" }),
    ];
    const sessions = detectSessions(events, {
      sessionGapMinutes: 15,
      minSessionEvents: 1,
    });
    expect(sessions).toHaveLength(2);
  });

  test("session bounds correct", () => {
    const events = [
      makeEvent({ id: "evt-1", eventTime: "2024-01-15T10:00:00.000Z" }),
      makeEvent({ id: "evt-2", eventTime: "2024-01-15T10:15:00.000Z" }),
      makeEvent({ id: "evt-3", eventTime: "2024-01-15T10:30:00.000Z" }),
    ];
    const sessions = detectSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.startedAt).toBe("2024-01-15T10:00:00.000Z");
    expect(sessions[0]?.endedAt).toBe("2024-01-15T10:30:00.000Z");
  });
});

describe("detectClusters", () => {
  test("single project, single branch → project cluster", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: { branch: "main" },
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-1",
        content: { branch: "main" },
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.clusterType).toBe("project");
    expect(clusters[0]?.projectId).toBe("proj-1");
  });

  test("single project, multiple branches → topic clusters", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: { branch: "feature/auth" },
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-1",
        content: { branch: "featureashboard" },
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.clusterType === "topic")).toBe(true);
  });

  test("task IDs create topic clusters", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: { taskId: "TASK-001" },
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-1",
        content: { taskId: "TASK-002" },
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.topicLabel).toBe("task:TASK-001");
    expect(clusters[1]?.topicLabel).toBe("task:TASK-002");
  });

  test("untagged events don't get topicLabel", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: {},
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.topicLabel).toBeUndefined();
  });

  test("mixed events (with/without project) → mixed cluster", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: {},
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: undefined,
        content: {},
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.clusterType === "mixed")).toBeDefined();
  });

  test("empty input returns empty", () => {
    const clusters = detectClusters([]);
    expect(clusters).toHaveLength(0);
  });

  test("sessionId passed through to clusters", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
    ];
    const clusters = detectClusters(events, "sess-1");
    expect(clusters[0]?.sessionId).toBe("sess-1");
  });

  test("cluster bounds correct", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: { branch: "main" },
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: "proj-1",
        content: { branch: "main" },
        eventTime: "2024-01-15T10:30:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters[0]?.startedAt).toBe("2024-01-15T10:00:00.000Z");
    expect(clusters[0]?.endedAt).toBe("2024-01-15T10:30:00.000Z");
  });

  test("branch topic derived correctly", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: "proj-1",
        content: { branch: "feature/auth/login" },
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters[0]?.topicLabel).toBe("branch:feature/auth");
  });

  test("no projectId events grouped into mixed cluster", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        projectId: undefined,
        content: {},
        eventTime: "2024-01-15T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        projectId: undefined,
        content: {},
        eventTime: "2024-01-15T10:10:00.000Z",
      }),
    ];
    const clusters = detectClusters(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.clusterType).toBe("mixed");
    expect(clusters[0]?.eventIds).toEqual(["evt-1", "evt-2"]);
  });
});
