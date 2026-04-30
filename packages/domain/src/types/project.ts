import type { ProjectStatus, ProjectType } from "./enums";

export interface Project {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly type: ProjectType;
  readonly status: ProjectStatus;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
}

export interface CreateProjectInput {
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly type: ProjectType;
}