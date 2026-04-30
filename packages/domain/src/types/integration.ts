import type {
  ExternalScopeType,
  IntegrationStatus,
  MappingType,
  Source,
} from "./enums";

export interface IntegrationConnection {
  readonly configRef: string;
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly status: IntegrationStatus;
}

export interface SourceMapping {
  readonly confidence: number;
  readonly externalScopeId: string;
  readonly externalScopeType: ExternalScopeType;
  readonly id: string;
  readonly mappingType: MappingType;
  readonly organizationId: string;
  readonly projectId: string;
  readonly source: Source;
}
