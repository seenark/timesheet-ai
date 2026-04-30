import type { ExternalScopeType, IntegrationStatus, MappingType, Source } from "./enums";

export interface IntegrationConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly name: string;
  readonly status: IntegrationStatus;
  readonly configRef: string;
  readonly createdAt: string;
}

export interface SourceMapping {
  readonly id: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly externalScopeType: ExternalScopeType;
  readonly externalScopeId: string;
  readonly projectId: string;
  readonly confidence: number;
  readonly mappingType: MappingType;
}