import { describe, expect, it } from "bun:test";
import type { CanonicalUser, NormalizedEvent, Organization, Project } from "../src/index";

describe("domain types compile correctly", () => {
  it("Organization has required fields", () => {
    const org: Organization = {
      id: "org_abc123",
      name: "Test Agency",
      slug: "test-agency",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(org.name).toBe("Test Agency");
  });

  it("Project has required fields", () => {
    const project: Project = {
      id: "proj_xyz",
      organizationId: "org_abc123",
      name: "Client Portal",
      code: "CP",
      type: "client",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(project.type).toBe("client");
  });

  it("CanonicalUser has required fields", () => {
    const user: CanonicalUser = {
      id: "user_1",
      organizationId: "org_abc123",
      displayName: "Jane Doe",
      primaryEmail: "jane@example.com",
      role: "admin",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(user.role).toBe("admin");
  });

  it("NormalizedEvent has nested structured fields", () => {
    const event: NormalizedEvent = {
      id: "evt_1",
      organizationId: "org_abc123",
      source: "git",
      sourceEventType: "commit",
      eventTime: "2026-04-30T10:00:00.000Z",
      ingestedAt: "2026-04-30T10:01:00.000Z",
      sourceRef: {
        connectionId: "conn_1",
        externalEventId: "sha_abc",
      },
      content: {
        message: "fix: auth token refresh",
        commitSha: "sha_abc",
        additions: 12,
        deletions: 4,
      },
      attribution: {},
      processingVersion: 1,
    };
    expect(event.source).toBe("git");
    expect(event.content.additions).toBe(12);
  });
});