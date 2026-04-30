import { describe, expect, it, vi, beforeEach } from "bun:test";
import type { WorkUnit } from "@timesheet-ai/domain";
import type { DailySummaryOutput } from "../schemas";

const createMockWorkUnit = (overrides: Partial<WorkUnit> = {}): WorkUnit => ({
  canonicalUserId: "user_001",
  confidence: 0.85,
  date: "2024-01-15",
  endedAt: "2024-01-15T17:00:00Z",
  estimatedMinutes: 90,
  evidenceEventIds: ["evt_001"],
  generationVersion: 1,
  id: "wu_001",
  organizationId: "org_001",
  projectId: "proj_001",
  reviewStatus: "draft" as const,
  sourceTypes: ["git"],
  startedAt: "2024-01-15T09:00:00Z",
  summary: "Added JWT-based authentication with login and logout endpoints.",
  title: "Implemented user authentication",
  ...overrides,
});

const mockGenerate = vi.fn();

vi.mock("@mastra/core/agent", () => ({
  Agent: vi.fn().mockImplementation(() => ({
    name: "Daily Summary Generator",
    generate: mockGenerate,
  })),
}));

const { generateDailySummary, dailySummaryAgent } = await import("../agents/daily-summary-agent");

describe("daily-summary-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateDailySummary", () => {
    it("is a callable async function with correct signature", async () => {
      expect(typeof generateDailySummary).toBe("function");

      const workUnits = [createMockWorkUnit()];

      const mockResponse = {
        object: {
          summary: "Completed implementation of user authentication.",
        } satisfies DailySummaryOutput,
      };

      mockGenerate.mockResolvedValueOnce(mockResponse);

      const result = await generateDailySummary(workUnits, "user", "user_001", "2024-01-15");

      expect(result).toEqual(mockResponse.object);
    });

    it("returns placeholder summary for empty work units", async () => {
      const result = await generateDailySummary([], "user", "user_001", "2024-01-15");

      expect(result.summary).toBe("No recorded work activities for this period.");
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("returns fallback when agent.generate throws", async () => {
      const workUnits = [createMockWorkUnit()];

      mockGenerate.mockRejectedValueOnce(new Error("LLM error"));

      const result = await generateDailySummary(workUnits, "user", "user_001", "2024-01-15");

      expect(result.summary).toBe("Work was recorded but summary generation failed. Please review individual work units.");
    });

    it("calls formatWorkUnitsForSummary with correct inputs", async () => {
      const workUnits = [
        createMockWorkUnit({
          id: "wu_001",
          title: "Implemented authentication",
          estimatedMinutes: 60,
          confidence: 0.9,
        }),
        createMockWorkUnit({
          id: "wu_002",
          title: "Fixed session bug",
          estimatedMinutes: 30,
          confidence: 0.75,
        }),
      ];

      const mockResponse = {
        object: {
          summary: "Worked on authentication features and fixed a bug.",
        } satisfies DailySummaryOutput,
      };

      mockGenerate.mockResolvedValueOnce(mockResponse);

      await generateDailySummary(workUnits, "project", "proj_001", "2024-01-15");

      const generateCall = mockGenerate.mock.calls[0];
      const contextArg = generateCall?.[0] as string;

      expect(contextArg).toContain("## Daily Summary");
      expect(contextArg).toContain("project:proj_001");
      expect(contextArg).toContain("Jan 15, 2024");
      expect(contextArg).toContain("Work Units: 2 total");
      expect(contextArg).toContain("Implemented authentication");
      expect(contextArg).toContain("Fixed session bug");
    });

    it("returns structured output from agent", async () => {
      const workUnits = [createMockWorkUnit()];

      const expectedOutput = {
        summary: "Completed implementation of user authentication including JWT-based login/logout, middleware integration, and password reset flow.",
      } satisfies DailySummaryOutput;

      mockGenerate.mockResolvedValueOnce({
        object: expectedOutput,
      });

      const result = await generateDailySummary(workUnits, "user", "user_001", "2024-01-15");

      expect(result).toEqual(expectedOutput);
      expect(result.summary).toContain("Completed implementation");
    });
  });

  describe("dailySummaryAgent", () => {
    it("is exported and has correct name", () => {
      expect(dailySummaryAgent.name).toBe("Daily Summary Generator");
    });
  });
});