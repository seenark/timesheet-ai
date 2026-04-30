import type { ReviewStatus, SummaryScopeType, SummaryStatus } from "./enums";

export interface ActivitySession {
  readonly canonicalUserId: string;
  readonly confidence: number;
  readonly endedAt: string;
  readonly eventIds: readonly string[];
  readonly id: string;
  readonly organizationId: string;
  readonly projectIds: readonly string[];
  readonly startedAt: string;
}

export interface ActivityCluster {
  readonly canonicalUserId: string;
  readonly clusterType: string;
  readonly confidence: number;
  readonly endedAt: string;
  readonly eventIds: readonly string[];
  readonly id: string;
  readonly organizationId: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly startedAt: string;
  readonly topicLabel?: string;
}

export interface WorkUnit {
  readonly canonicalUserId: string;
  readonly confidence: number;
  readonly date: string;
  readonly endedAt: string;
  readonly estimatedMinutes: number;
  readonly evidenceEventIds: readonly string[];

  readonly generationVersion: number;
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly reviewStatus: ReviewStatus;

  readonly sourceTypes: readonly string[];

  readonly startedAt: string;
  readonly summary: string;

  readonly title: string;
}

export interface DailySummary {
  readonly date: string;
  readonly generatedAt: string;
  readonly id: string;
  readonly organizationId: string;
  readonly scopeId: string;
  readonly scopeType: SummaryScopeType;
  readonly status: SummaryStatus;
  readonly summary: string;
  readonly workUnitIds: readonly string[];
}
