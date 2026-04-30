import { describe, expect, it } from "bun:test";
import type { ActivityCluster, NormalizedEvent, WorkUnit } from "@timesheet-ai/domain";
import { formatEventsForWorkUnit, formatWorkUnitsForSummary } from "../prompts";

const createMockEvent = (overrides: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  attribution: {},
  content: {},
  eventTime: "2024-01-15T09:00:00Z",
  id: "evt_001",
  organizationId: "org_001",
  source: "git",
  sourceEventType: "commit",
  sourceRef: { connectionId: "conn_001", externalEventId: "ext_001" },
  ingestedAt: "2024-01-15T08:00:00Z",
  processingVersion: 1,
  ...overrides,
});

const createMockCluster = (overrides: Partial<ActivityCluster> = {}): ActivityCluster => ({
  id: "clust_001",
  clusterType: "project",
  startedAt: "2024-01-15T09:00:00Z",
  endedAt: "2024-01-15T12:00:00Z",
  eventIds: ["evt_001", "evt_002"],
  canonicalUserId: "user_001",
  organizationId: "org_001",
  projectId: "proj_001",
  confidence: 0.85,
  ...overrides,
});

const createMockWorkUnit = (overrides: Partial<WorkUnit> = {}): WorkUnit => ({
  id: "wu_001",
  title: "Test work",
  summary: "Test summary",
  estimatedMinutes: 60,
  confidence: 0.85,
  reviewStatus: "draft",
  canonicalUserId: "user_001",
  organizationId: "org_001",
  projectId: "proj_001",
  date: "2024-01-15",
  startedAt: "2024-01-15T09:00:00Z",
  endedAt: "2024-01-15T10:00:00Z",
  evidenceEventIds: ["evt_001"],
  sourceTypes: ["git"],
  generationVersion: 1,
  ...overrides,
});

describe("formatEventsForWorkUnit", () => {
  it("formats a cluster with git commit events", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "git",
        sourceEventType: "commit",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          branch: "feature/auth",
          commitSha: "abc123def456",
          title: "Add user login",
          fileCount: 3,
          additions: 45,
          deletions: 12,
        },
      }),
      createMockEvent({
        id: "evt_002",
        source: "git",
        sourceEventType: "commit",
        eventTime: "2024-01-15T10:30:00Z",
        content: {
          branch: "feature/auth",
          commitSha: "def456abc789",
          title: "Fix auth bug",
          fileCount: 1,
          additions: 10,
          deletions: 5,
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("## Activity Cluster");
    expect(result).toContain("Cluster ID: clust_001");
    expect(result).toContain("Type: project");
    expect(result).toContain("Project: proj_001");
    expect(result).toContain("Jan 15, 2024 9:00 AM");
    expect(result).toContain("Jan 15, 2024 12:00 PM");
    expect(result).toContain("Events: 2 total");
    expect(result).toContain("### Events:");
    expect(result).toContain("[git.commit] Jan 15, 2024 9:00 AM - Branch: feature/auth - Commit: abc123d - \"Add user login\"");
    expect(result).toContain("Files: 3, +45/-12");
    expect(result).toContain("[git.commit] Jan 15, 2024 10:30 AM - Branch: feature/auth - Commit: def456a - \"Fix auth bug\"");
    expect(result).toContain("Files: 1, +10/-5");
  });

  it("formats git.push events", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "git",
        sourceEventType: "push",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          branch: "main",
          tags: ["tag1", "tag2", "tag3"],
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("[git.push] Jan 15, 2024 9:00 AM - Branch: main - 3 commit(s)");
  });

  it("formats plane.issue_updated events", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "plane",
        sourceEventType: "issue_updated",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          title: "Fix login bug",
          taskStatus: "in_progress",
          taskId: "PLANE-123",
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("[plane.issue_updated] Jan 15, 2024 9:00 AM - Title: \"Fix login bug\" - Status: in_progress - Task ID: PLANE-123");
  });

  it("formats plane.issue_created events", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "plane",
        sourceEventType: "issue_created",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          title: "New feature request",
          taskId: "PLANE-456",
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("[plane.issue_created] Jan 15, 2024 9:00 AM - Title: \"New feature request\" - Task ID: PLANE-456");
  });

  it("formats discord.message events", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "discord",
        sourceEventType: "message",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          channelName: "dev-chat",
          message: "Hey team, I just pushed the new authentication feature. Please review when you get a chance!",
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("[discord.message] Jan 15, 2024 9:00 AM - Channel: dev-chat - Message: \"Hey team, I just pushed the new authentication feature. Please review when you get a chance!\"");
  });

  it("truncates long discord messages", () => {
    const cluster = createMockCluster();
    const longMessage = "A".repeat(150);
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "discord",
        sourceEventType: "message",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          channelName: "general",
          message: longMessage,
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("...");
    expect(result).not.toContain(longMessage);
  });

  it("formats generic events with fallback", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        id: "evt_001",
        source: "git",
        sourceEventType: "custom_hook",
        eventTime: "2024-01-15T09:00:00Z",
        content: {
          title: "Sprint 5 started",
          body: "Sprint goals have been updated",
        },
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("[git.custom_hook] Jan 15, 2024 9:00 AM");
    expect(result).toContain("Title: \"Sprint 5 started\"");
    expect(result).toContain("Body: \"Sprint goals have been updated\"");
  });

  it("includes topic label when present", () => {
    const cluster = createMockCluster({ topicLabel: "branch:feature/auth" });
    const events = [createMockEvent()];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("Topic: branch:feature/auth");
  });

  it("handles missing optional fields gracefully", () => {
    const cluster = createMockCluster({ projectId: undefined, topicLabel: undefined });
    const events = [
      createMockEvent({
        content: {},
        attribution: {},
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("Type: project");
    expect(result).not.toContain("Topic:");
    expect(result).not.toContain("Project:");
  });

  it("handles events with missing content fields", () => {
    const cluster = createMockCluster();
    const events = [
      createMockEvent({
        source: "git",
        sourceEventType: "commit",
        content: {},
      }),
    ];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("Branch: unknown - Commit: ??????? - \"No message\"");
    expect(result).toContain("Files: 0, +0/-0");
  });

  it("formats mixed cluster type correctly", () => {
    const cluster = createMockCluster({ clusterType: "mixed" });
    const events = [createMockEvent()];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("Type: mixed");
  });

  it("formats topic cluster type correctly", () => {
    const cluster = createMockCluster({ clusterType: "topic", projectId: undefined });
    const events = [createMockEvent()];

    const result = formatEventsForWorkUnit(cluster, events);

    expect(result).toContain("Type: topic");
    expect(result).not.toContain("Project:");
  });
});

describe("formatWorkUnitsForSummary", () => {
  it("formats work units for user scope", () => {
    const workUnits = [
      createMockWorkUnit({
        id: "wu_001",
        title: "Implemented user authentication",
        summary: "Added JWT-based authentication with login/logout endpoints. Created User model and auth middleware.",
        estimatedMinutes: 60,
        confidence: 0.85,
      }),
      createMockWorkUnit({
        id: "wu_002",
        title: "Fixed auth token expiry bug",
        summary: "Tokens were not being refreshed correctly. Added proper expiry handling.",
        estimatedMinutes: 30,
        confidence: 0.9,
      }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-15");

    expect(result).toContain("## Daily Summary for user:user_001 on Jan 15, 2024");
    expect(result).toContain("### Work Units: 2 total (estimated 90 minutes)");
    expect(result).toContain("1. **Implemented user authentication** (60 min, confidence: 0.85)");
    expect(result).toContain("   Summary: Added JWT-based authentication with login/logout endpoints. Created User model and auth middleware.");
    expect(result).toContain("2. **Fixed auth token expiry bug** (30 min, confidence: 0.90)");
    expect(result).toContain("   Summary: Tokens were not being refreshed correctly. Added proper expiry handling.");
  });

  it("formats work units for project scope", () => {
    const workUnits = [
      createMockWorkUnit({
        id: "wu_001",
        projectId: "proj_001",
        title: "Backend API development",
        summary: "Created REST API endpoints for user management.",
        estimatedMinutes: 120,
        confidence: 0.95,
      }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "project", "proj_001", "2024-01-15");

    expect(result).toContain("## Daily Summary for project:proj_001 on Jan 15, 2024");
    expect(result).toContain("### Work Units: 1 total (estimated 120 minutes)");
    expect(result).toContain("1. **Backend API development** (120 min, confidence: 0.95)");
  });

  it("returns message when no work units exist", () => {
    const result = formatWorkUnitsForSummary([], "user", "user_001", "2024-01-15");

    expect(result).toContain("## Daily Summary for user:user_001 on Jan 15, 2024");
    expect(result).toContain("No work was recorded for this user.");
  });

  it("handles single work unit", () => {
    const workUnits = [
      createMockWorkUnit({
        id: "wu_001",
        title: "Quick bug fix",
        summary: "Fixed a small UI bug.",
        estimatedMinutes: 15,
        confidence: 0.7,
      }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-15");

    expect(result).toContain("### Work Units: 1 total (estimated 15 minutes)");
    expect(result).toContain("1. **Quick bug fix** (15 min, confidence: 0.70)");
  });

  it("calculates total minutes correctly for multiple work units", () => {
    const workUnits = [
      createMockWorkUnit({ id: "wu_001", estimatedMinutes: 30, confidence: 0.8 }),
      createMockWorkUnit({ id: "wu_002", estimatedMinutes: 45, confidence: 0.85 }),
      createMockWorkUnit({ id: "wu_003", estimatedMinutes: 60, confidence: 0.9 }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-15");

    expect(result).toContain("(estimated 135 minutes)");
  });

  it("formats confidence to 2 decimal places", () => {
    const workUnits = [
      createMockWorkUnit({ confidence: 0.856 }),
      createMockWorkUnit({ confidence: 0.9 }),
      createMockWorkUnit({ confidence: 1.0 }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-15");

    expect(result).toContain("confidence: 0.86");
    expect(result).toContain("confidence: 0.90");
    expect(result).toContain("confidence: 1.00");
  });

  it("handles work units with different review statuses", () => {
    const workUnits = [
      createMockWorkUnit({ id: "wu_001", reviewStatus: "draft" }),
      createMockWorkUnit({ id: "wu_002", reviewStatus: "reviewed" }),
      createMockWorkUnit({ id: "wu_003", reviewStatus: "approved" }),
      createMockWorkUnit({ id: "wu_004", reviewStatus: "flagged" }),
    ];

    const result = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-15");

    expect(result).toContain("### Work Units: 4 total");
  });

  it("handles various date formats", () => {
    const workUnits = [createMockWorkUnit()];

    const result1 = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-12-31");
    expect(result1).toContain("Dec 31, 2024");

    const result2 = formatWorkUnitsForSummary(workUnits, "user", "user_001", "2024-01-01");
    expect(result2).toContain("Jan 1, 2024");
  });
});
