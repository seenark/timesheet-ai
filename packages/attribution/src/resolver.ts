import type { NormalizedEvent } from "@timesheet-ai/domain";
import type {
  AttributionResult,
  AttributionRule,
  DirectMapping,
} from "./types";

const escapeRegex = (pattern: string): string =>
  pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const matchPattern = (text: string, pattern: string): boolean => {
  const regex = new RegExp(`^${escapeRegex(pattern)}`, "i");
  return regex.test(text);
};

const tryDirectMapping = (
  event: NormalizedEvent,
  directMappings: readonly DirectMapping[]
): AttributionResult | null => {
  if (!event.externalIdentityId) {
    return null;
  }
  const direct = directMappings.find(
    (m) => m.externalIdentityId === event.externalIdentityId
  );
  if (!direct) {
    return null;
  }
  return {
    attributionMethod: "direct",
    canonicalUserId: direct.canonicalUserId,
    identityConfidence: 1.0,
    projectConfidence: direct.projectId ? 1.0 : 0,
    projectId: direct.projectId,
  };
};

const ruleMatches = (
  rule: AttributionRule,
  branch: string | undefined,
  taskId: string | undefined,
  channelName: string | undefined
): boolean => {
  if (rule.ruleType === "branch-prefix" && branch) {
    return matchPattern(branch, rule.pattern);
  }
  if (rule.ruleType === "issue-key" && taskId) {
    return matchPattern(taskId, rule.pattern);
  }
  if (rule.ruleType === "channel-name" && channelName) {
    return matchPattern(channelName, rule.pattern);
  }
  return false;
};

const tryRuleBasedAttribution = (
  rules: readonly AttributionRule[],
  connectionId: string,
  branch: string | undefined,
  taskId: string | undefined,
  channelName: string | undefined
): AttributionResult | null => {
  const sortedRules = [...rules]
    .filter((r) => r.connectionId === connectionId)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (ruleMatches(rule, branch, taskId, channelName)) {
      return {
        attributionMethod: "rule",
        canonicalUserId: rule.canonicalUserId,
        identityConfidence: rule.canonicalUserId ? 0.85 : 0,
        projectConfidence: rule.projectId ? 0.9 : 0,
        projectId: rule.projectId,
        ruleId: rule.id,
      };
    }
  }
  return null;
};

const tryInferredAttribution = (
  event: NormalizedEvent
): AttributionResult | null => {
  if (!event.canonicalUserId) {
    return null;
  }
  return {
    attributionMethod: "inferred",
    canonicalUserId: event.canonicalUserId,
    identityConfidence: event.attribution.identityConfidence ?? 0.7,
    projectConfidence:
      event.attribution.projectConfidence ?? (event.projectId ? 0.5 : 0),
    projectId: event.projectId,
  };
};

export const attributeEvent = (
  event: NormalizedEvent,
  directMappings: readonly DirectMapping[],
  rules: readonly AttributionRule[]
): AttributionResult => {
  const branch = event.content.branch;
  const taskId = event.content.taskId;
  const channelName = event.content.channelName;
  const connectionId = event.sourceRef.connectionId;

  const direct = tryDirectMapping(event, directMappings);
  if (direct) {
    return direct;
  }

  const ruleBased = tryRuleBasedAttribution(
    rules,
    connectionId,
    branch,
    taskId,
    channelName
  );
  if (ruleBased) {
    return ruleBased;
  }

  const inferred = tryInferredAttribution(event);
  if (inferred) {
    return inferred;
  }

  return {
    attributionMethod: "manual",
    identityConfidence: 0,
    projectConfidence: event.projectId ? 0.5 : 0,
    projectId: event.projectId,
  };
};
