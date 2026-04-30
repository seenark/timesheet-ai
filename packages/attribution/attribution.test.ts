import { describe, expect, test } from "bun:test";
import type { Source } from "@timesheet-ai/domain";
import type { AttributionRule, DirectMapping } from "./src/types";
import type { NormalizedEvent } from "@timesheet-ai/domain";
import { attributeEvent } from "./src/index";

const makeEvent = (overrides: Partial<NormalizedEvent> = {}): NormalizedEvent =>
  ({
    attribution: {},
    content: {},
    eventTime: "2024-01-01T00:00:00.000Z",
    id: "evt-1",
    ingestedAt: "2024-01-01T00:00:00.000Z",
    organizationId: "org-1",
    processingVersion: 1,
    source: "git" as Source,
    sourceEventType: "push",
    sourceRef: {
      connectionId: "conn-1",
      externalEventId: "ext-evt-1",
    },
    ...overrides,
  }) as NormalizedEvent;

const makeRule = (overrides: Partial<AttributionRule> = {}): AttributionRule => ({
  id: "rule-1",
  connectionId: "conn-1",
  organizationId: "org-1",
  pattern: "feature/",
  priority: 10,
  ruleType: "branch-prefix",
  source: "git" as Source,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const makeMapping = (overrides: Partial<DirectMapping> = {}): DirectMapping => ({
  externalIdentityId: "ext-id-1",
  ...overrides,
});

describe("attributeEvent", () => {
  test("returns direct attribution when externalIdentityId matches a direct mapping", () => {
    const event = makeEvent({ externalIdentityId: "ext-id-1" });
    const mappings = [makeMapping({ externalIdentityId: "ext-id-1", canonicalUserId: "u1", projectId: "p1" })];
    const result = attributeEvent(event, mappings, []);
    expect(result.attributionMethod).toBe("direct");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.projectId).toBe("p1");
    expect(result.identityConfidence).toBe(1.0);
    expect(result.projectConfidence).toBe(1.0);
  });

  test("prefers direct mapping over rules", () => {
    const event = makeEvent({
      externalIdentityId: "ext-id-1",
      content: { branch: "feature/my-branch" },
    });
    const mappings = [makeMapping({ externalIdentityId: "ext-id-1", canonicalUserId: "u1" })];
    const rules = [makeRule({ pattern: "feature/", canonicalUserId: "u2" })];
    const result = attributeEvent(event, mappings, rules);
    expect(result.attributionMethod).toBe("direct");
    expect(result.canonicalUserId).toBe("u1");
  });

  test("applies branch-prefix rule when branch matches", () => {
    const event = makeEvent({ content: { branch: "feature/my-branch" } });
    const rules = [makeRule({ pattern: "feature/", canonicalUserId: "u1", projectId: "p1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("rule");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.projectId).toBe("p1");
    expect(result.ruleId).toBe("rule-1");
    expect(result.identityConfidence).toBe(0.85);
    expect(result.projectConfidence).toBe(0.9);
  });

  test("applies issue-key rule when taskId matches", () => {
    const event = makeEvent({ content: { taskId: "PLANE-123" } });
    const rules = [makeRule({ ruleType: "issue-key", pattern: "PLANE-", canonicalUserId: "u1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("rule");
    expect(result.canonicalUserId).toBe("u1");
  });

  test("applies channel-name rule when channelName matches", () => {
    const event = makeEvent({ content: { channelName: "engineering" } });
    const rules = [makeRule({ ruleType: "channel-name", pattern: "engineering", projectId: "p1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("rule");
    expect(result.projectId).toBe("p1");
  });

  test("uses highest priority rule when multiple rules match", () => {
    const event = makeEvent({ content: { branch: "feature/my-branch" } });
    const rules = [
      makeRule({ id: "rule-low", pattern: "feature/", priority: 5, canonicalUserId: "u1" }),
      makeRule({ id: "rule-high", pattern: "feature/", priority: 20, canonicalUserId: "u2" }),
    ];
    const result = attributeEvent(event, [], rules);
    expect(result.canonicalUserId).toBe("u2");
    expect(result.ruleId).toBe("rule-high");
  });

  test("ignores rules for different connectionId", () => {
    const event = makeEvent({ content: { branch: "feature/my-branch" }, sourceRef: { connectionId: "conn-2", externalEventId: "x" } });
    const rules = [makeRule({ connectionId: "conn-1", pattern: "feature/", canonicalUserId: "u1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("manual");
    expect(result.canonicalUserId).toBeUndefined();
  });

  test("returns inferred attribution when event already has canonicalUserId and no rule matches", () => {
    const event = makeEvent({ canonicalUserId: "u1", attribution: { identityConfidence: 0.8 } });
    const result = attributeEvent(event, [], []);
    expect(result.attributionMethod).toBe("inferred");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.identityConfidence).toBe(0.8);
  });

  test("returns manual attribution when nothing matches", () => {
    const event = makeEvent();
    const result = attributeEvent(event, [], []);
    expect(result.attributionMethod).toBe("manual");
    expect(result.identityConfidence).toBe(0);
  });

  test("branch pattern matching is case-insensitive", () => {
    const event = makeEvent({ content: { branch: "FEATURE/my-branch" } });
    const rules = [makeRule({ pattern: "feature/", canonicalUserId: "u1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("rule");
  });

  test("branch pattern requires exact prefix match", () => {
    const event = makeEvent({ content: { branch: "my-feature-branch" } });
    const rules = [makeRule({ pattern: "feature/", canonicalUserId: "u1" })];
    const result = attributeEvent(event, [], rules);
    expect(result.attributionMethod).toBe("manual");
  });

  test("returns projectId from event when no rule provides one", () => {
    const event = makeEvent({ canonicalUserId: "u1", projectId: "p-event", attribution: { identityConfidence: 0.7 } });
    const result = attributeEvent(event, [], []);
    expect(result.attributionMethod).toBe("inferred");
    expect(result.projectId).toBe("p-event");
    expect(result.projectConfidence).toBe(0.5);
  });
});