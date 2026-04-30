import type { AttributionMethod, Source } from "@timesheet-ai/domain";

export interface AttributionRule {
  readonly canonicalUserId?: string;
  readonly connectionId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly organizationId: string;
  readonly pattern: string;
  readonly priority: number;
  readonly projectId?: string;
  readonly ruleType: "branch-prefix" | "issue-key" | "channel-name";
  readonly source: Source;
}

export interface DirectMapping {
  readonly canonicalUserId?: string;
  readonly externalIdentityId: string;
  readonly projectId?: string;
}

export interface AttributionResult {
  readonly attributionMethod: AttributionMethod;
  readonly canonicalUserId?: string;
  readonly identityConfidence: number;
  readonly projectConfidence: number;
  readonly projectId?: string;
  readonly ruleId?: string;
}

export interface AttributedEvent extends AttributionResult {
  readonly canonicalUserId: string | undefined;
  readonly projectId: string | undefined;
}