import type { ReviewStatus, SummaryScopeType, SummaryStatus } from "./enums";

export interface ActivitySession {
  readonly id: string;
  readonly organizationId: string;
  readonly canonicalUserId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly eventIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly confidence: number;
}

export interface ActivityCluster {
  readonly id: string;
  readonly organizationId: string;
  readonly canonicalUserId: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly eventIds: readonly string[];
  readonly topicLabel?: string;
  readonly clusterType: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly confidence: number;
}

export interface WorkUnit {
  readonly id: string;
  readonly organizationId: string;
  readonly canonicalUserId: string;
  readonly projectId: string;
  readonly date: string;

  readonly title: string;
  readonly summary: string;
  readonly evidenceEventIds: readonly string[];

  readonly startedAt: string;
  readonly endedAt: string;
  readonly estimatedMinutes: number;

  readonly sourceTypes: readonly string[];
  readonly confidence: number;
  readonly reviewStatus: ReviewStatus;

  readonly generationVersion: number;
}

export interface DailySummary {
  readonly id: string;
  readonly organizationId: string;
  readonly scopeType: SummaryScopeType;
  readonly scopeId: string;
  readonly date: string;
  readonly summary: string;
  readonly workUnitIds: readonly string[];
  readonly generatedAt: string;
  readonly status: SummaryStatus;
}