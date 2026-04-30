import { Schema } from "effect";
import {
  ExternalScopeTypeSchema,
  IntegrationStatusSchema,
  MappingTypeSchema,
  SourceSchema,
} from "./enums";

export const IntegrationConnectionSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  source: SourceSchema,
  name: Schema.String,
  status: IntegrationStatusSchema,
  configRef: Schema.String,
  createdAt: Schema.String,
}).annotations({ identifier: "IntegrationConnection" });

export const SourceMappingSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  source: SourceSchema,
  externalScopeType: ExternalScopeTypeSchema,
  externalScopeId: Schema.String,
  projectId: Schema.String,
  confidence: Schema.Number,
  mappingType: MappingTypeSchema,
}).annotations({ identifier: "SourceMapping" });
