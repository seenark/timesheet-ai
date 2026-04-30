import type { JobStatus, RecomputeLevel } from "./enums";

export interface JobRun {
  readonly completedAt?: string;
  readonly error?: string;
  readonly id: string;
  readonly jobType: string;
  readonly metadata?: Record<string, unknown>;
  readonly organizationId: string;
  readonly startedAt: string;
  readonly status: JobStatus;
}

export interface RecomputeRequest {
  readonly completedAt?: string;
  readonly id: string;
  readonly level: RecomputeLevel;
  readonly organizationId: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly scope: {
    readonly userId?: string;
    readonly projectId?: string;
    readonly dateStart?: string;
    readonly dateEnd?: string;
  };
  readonly status: JobStatus;
}
