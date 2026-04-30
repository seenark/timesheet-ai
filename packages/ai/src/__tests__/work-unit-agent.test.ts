import { describe, expect, it, vi, beforeEach } from "bun:test";
import type { ActivityCluster, NormalizedEvent } from "@timesheet-ai/domain";
import type { WorkUnitOutput } from "../schemas";

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

const mockGenerate = vi.fn();

vi.mock("@mastra/core/agent", () => ({
  Agent: vi.fn().mockImplementation(() => ({
    id: "work-unit-generator",
    name: "Work Unit Generator",
    generate: mockGenerate,
  })),
}));

const { generateWorkUnit } = await import("../agents/work-unit-agent");

describe("work-unit-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateWorkUnit", () => {
    it("is a callable async function with correct signature", async () => {
      expect(typeof generateWorkUnit).toBe("function");

      const cluster = createMockCluster();
      const events = [createMockEvent()];

      const mockResponse = {
        object: {
          title: "Test work unit",
          summary: "Test summary of work done.",
          estimatedMinutes: 60,
          confidence: 0.85,
        } satisfies WorkUnitOutput,
      };

      mockGenerate.mockResolvedValueOnce(mockResponse);

      const result = await generateWorkUnit(cluster, events);

      expect(result).toEqual(mockResponse.object);
    });

    it("returns fallback when agent.generate throws", async () => {
      const cluster = createMockCluster();
      const events = [createMockEvent()];

      mockGenerate.mockRejectedValueOnce(new Error("LLM error"));

      const result = await generateWorkUnit(cluster, events);

      expect(result).toEqual({
        title: "Activity recorded",
        summary: "Developer activity was recorded. Details pending review.",
        estimatedMinutes: 30,
        confidence: 0.3,
      });
    });

    it("calls formatEventsForWorkUnit with correct inputs", async () => {
      const cluster = createMockCluster({
        id: "clust_test_123",
        clusterType: "topic",
        topicLabel: "branch:feature/auth",
      });
      const events = [
        createMockEvent({ id: "evt_001", source: "git", sourceEventType: "commit" }),
        createMockEvent({ id: "evt_002", source: "plane", sourceEventType: "issue_updated" }),
      ];

      const mockResponse = {
        object: {
          title: "Implemented auth feature",
          summary: "Work done on authentication.",
          estimatedMinutes: 120,
          confidence: 0.9,
        } satisfies WorkUnitOutput,
      };

      mockGenerate.mockResolvedValueOnce(mockResponse);

      await generateWorkUnit(cluster, events);

      const generateCall = mockGenerate.mock.calls[0];
      const contextArg = generateCall?.[0] as string;

      expect(contextArg).toContain("## Activity Cluster");
      expect(contextArg).toContain("Cluster ID: clust_test_123");
      expect(contextArg).toContain("Type: topic");
      expect(contextArg).toContain("Topic: branch:feature/auth");
      expect(contextArg).toContain("Events: 2 total");
    });

    it("returns structured output from agent", async () => {
      const cluster = createMockCluster();
      const events = [createMockEvent()];

      const expectedOutput = {
        title: "Implemented user authentication",
        summary: "Added JWT-based authentication with login and logout endpoints.",
        estimatedMinutes: 90,
        confidence: 0.88,
      } satisfies WorkUnitOutput;

      mockGenerate.mockResolvedValueOnce({
        object: expectedOutput,
      });

      const result = await generateWorkUnit(cluster, events);

      expect(result).toEqual(expectedOutput);
      expect(result.title).toBe("Implemented user authentication");
      expect(result.estimatedMinutes).toBe(90);
      expect(result.confidence).toBe(0.88);
    });
  });
});
