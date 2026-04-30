export interface SessionizationConfig {
  readonly sessionGapMinutes: number;
  readonly minSessionEvents: number;
}

export const DEFAULT_CONFIG: SessionizationConfig = {
  sessionGapMinutes: 30,
  minSessionEvents: 1,
};

export interface SessionInput {
  readonly canonicalUserId: string;
  readonly eventTime: string;
  readonly id: string;
  readonly organizationId: string;
  readonly projectId?: string;
  readonly source: string;
  readonly sourceEventType: string;
  readonly content: {
    readonly branch?: string;
    readonly taskId?: string;
    readonly message?: string;
    readonly title?: string;
  };
}

export interface DetectedSession {
  readonly canonicalUserId: string;
  readonly endedAt: string;
  readonly eventIds: string[];
  readonly organizationId: string;
  readonly projectIds: string[];
  readonly startedAt: string;
}

export interface DetectedCluster {
  readonly canonicalUserId: string;
  readonly clusterType: "project" | "topic" | "mixed";
  readonly endedAt: string;
  readonly eventIds: string[];
  readonly organizationId: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly startedAt: string;
  readonly topicLabel?: string;
}
