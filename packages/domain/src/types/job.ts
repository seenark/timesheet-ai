import type { JobStatus, RecomputeLevel } from "./enums";

export interface JobRun {
  readonly id: string;
  readonly organizationId: string;
  readonly jobType: string;
  readonly status: JobStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RecomputeRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly level: RecomputeLevel;
  readonly scope: {
    readonly userId?: string;
    readonly projectId?: string;
    readonly dateStart?: string;
    readonly dateEnd?: string;
  };
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly status: JobStatus;
}