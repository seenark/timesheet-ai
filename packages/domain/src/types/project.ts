import type { ProjectStatus, ProjectType } from "./enums";

export interface Project {
  readonly code: string;
  readonly createdAt: string;
  readonly id: string;
  readonly metadata?: Record<string, unknown>;
  readonly name: string;
  readonly organizationId: string;
  readonly status: ProjectStatus;
  readonly type: ProjectType;
}

export interface CreateProjectInput {
  readonly code: string;
  readonly name: string;
  readonly organizationId: string;
  readonly type: ProjectType;
}
