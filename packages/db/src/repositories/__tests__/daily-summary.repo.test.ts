import { describe, expect, it } from "bun:test";
import type { SummaryScopeType } from "@timesheet-ai/domain";
import {
  createDailySummary,
  deleteSummariesByOrg,
  getDailySummary,
  listSummariesByOrg,
  listSummariesByScope,
} from "../daily-summary.repo";

describe("daily-summary.repo", () => {
  describe("createDailySummary", () => {
    it("has correct input types and returns Effect", () => {
      const input = {
        organizationId: "org_abc",
        scopeType: "user" as SummaryScopeType,
        scopeId: "user_123",
        date: "2026-04-30",
        summary: "Test daily summary",
        workUnitIds: ["work_1", "work_2"] as const,
      };

      const result = createDailySummary(input);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("getDailySummary", () => {
    it("accepts string id and returns Effect", () => {
      const result = getDailySummary("sum_abc123");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("listSummariesByScope", () => {
    it("accepts scopeType, scopeId and date range and returns Effect", () => {
      const result = listSummariesByScope(
        "user",
        "user_123",
        "2026-04-01",
        "2026-04-30"
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    it("accepts project scopeType", () => {
      const result = listSummariesByScope(
        "project",
        "proj_456",
        "2026-04-01",
        "2026-04-30"
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("listSummariesByOrg", () => {
    it("accepts organizationId and returns Effect", () => {
      const result = listSummariesByOrg("org_abc");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("deleteSummariesByOrg", () => {
    it("accepts organizationId and returns Effect<void>", () => {
      const result = deleteSummariesByOrg("org_abc");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });
});
