import type { AttributionRule, AttributionResult, DirectMapping } from "./types";
import type { NormalizedEvent } from "@timesheet-ai/domain";

const escapeRegex = (pattern: string): string =>
  pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const matchPattern = (text: string, pattern: string): boolean => {
  const regex = new RegExp(`^${escapeRegex(pattern)}`, "i");
  return regex.test(text);
};

export const attributeEvent = (
  event: NormalizedEvent,
  directMappings: readonly DirectMapping[],
  rules: readonly AttributionRule[]
): AttributionResult => {
  if (event.externalIdentityId) {
    const direct = directMappings.find(
      (m) => m.externalIdentityId === event.externalIdentityId
    );
    if (direct) {
      return {
        attributionMethod: "direct",
        canonicalUserId: direct.canonicalUserId,
        identityConfidence: 1.0,
        projectConfidence: direct.projectId ? 1.0 : 0,
        projectId: direct.projectId,
      };
    }
  }

  const branch = event.content.branch;
  const taskId = event.content.taskId;
  const channelName = event.content.channelName;
  const connectionId = event.sourceRef.connectionId;

  const sortedRules = [...rules]
    .filter((r) => r.connectionId === connectionId)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    let matched = false;

    if (rule.ruleType === "branch-prefix" && branch) {
      matched = matchPattern(branch, rule.pattern);
    } else if (rule.ruleType === "issue-key" && taskId) {
      matched = matchPattern(taskId, rule.pattern);
    } else if (rule.ruleType === "channel-name" && channelName) {
      matched = matchPattern(channelName, rule.pattern);
    }

    if (matched) {
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

  if (event.canonicalUserId) {
    return {
      attributionMethod: "inferred",
      canonicalUserId: event.canonicalUserId,
      identityConfidence: event.attribution.identityConfidence ?? 0.7,
      projectConfidence: event.attribution.projectConfidence ?? (event.projectId ? 0.5 : 0),
      projectId: event.projectId,
    };
  }

  return {
    attributionMethod: "manual",
    identityConfidence: 0,
    projectConfidence: event.projectId ? 0.5 : 0,
    projectId: event.projectId,
  };
};