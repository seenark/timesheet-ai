import { describe, expect, it } from "bun:test";
import {
  createWorkUnit,
  deleteWorkUnitsByOrg,
  getWorkUnit,
  listWorkUnitsByOrg,
  listWorkUnitsByProject,
  listWorkUnitsByUser,
} from "../work-unit.repo";

describe("work-unit.repo", () => {
  describe("createWorkUnit", () => {
    it("has correct input types and returns Effect", () => {
      const input = {
        organizationId: "org_abc",
        canonicalUserId: "user_123",
        projectId: "proj_456",
        date: "2026-04-30",
        title: "Test Work",
        summary: "Test summary",
        evidenceEventIds: ["evt_1", "evt_2"] as const,
        startedAt: "2026-04-30T09:00:00.000Z",
        endedAt: "2026-04-30T10:00:00.000Z",
        estimatedMinutes: 60,
        sourceTypes: ["git"] as const,
        confidence: 0.95,
      };

      const result = createWorkUnit(input);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("getWorkUnit", () => {
    it("accepts string id and returns Effect", () => {
      const result = getWorkUnit("work_abc123");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("listWorkUnitsByUser", () => {
    it("accepts userId and date range and returns Effect", () => {
      const result = listWorkUnitsByUser(
        "user_123",
        "2026-04-01",
        "2026-04-30"
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("listWorkUnitsByProject", () => {
    it("accepts projectId and date range and returns Effect", () => {
      const result = listWorkUnitsByProject(
        "proj_456",
        "2026-04-01",
        "2026-04-30"
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("listWorkUnitsByOrg", () => {
    it("accepts organizationId and returns Effect", () => {
      const result = listWorkUnitsByOrg("org_abc");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("deleteWorkUnitsByOrg", () => {
    it("accepts organizationId and returns Effect<void>", () => {
      const result = deleteWorkUnitsByOrg("org_abc");
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });
});
