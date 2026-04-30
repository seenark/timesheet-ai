import { Schema } from "effect";
import {
  ReviewStatusSchema,
  SummaryScopeTypeSchema,
  SummaryStatusSchema,
} from "./enums";

export const ActivitySessionSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  canonicalUserId: Schema.String,
  startedAt: Schema.String,
  endedAt: Schema.String,
  eventIds: Schema.Array(Schema.String),
  projectIds: Schema.Array(Schema.String),
  confidence: Schema.Number,
}).annotations({ identifier: "ActivitySession" });

export const ActivityClusterSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  canonicalUserId: Schema.String,
  projectId: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  eventIds: Schema.Array(Schema.String),
  topicLabel: Schema.optional(Schema.String),
  clusterType: Schema.String,
  startedAt: Schema.String,
  endedAt: Schema.String,
  confidence: Schema.Number,
}).annotations({ identifier: "ActivityCluster" });

export const WorkUnitSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  canonicalUserId: Schema.String,
  projectId: Schema.String,
  date: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  evidenceEventIds: Schema.Array(Schema.String),
  startedAt: Schema.String,
  endedAt: Schema.String,
  estimatedMinutes: Schema.Number,
  sourceTypes: Schema.Array(Schema.String),
  confidence: Schema.Number,
  reviewStatus: ReviewStatusSchema,
  generationVersion: Schema.Number,
}).annotations({ identifier: "WorkUnit" });

export const DailySummarySchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  scopeType: SummaryScopeTypeSchema,
  scopeId: Schema.String,
  date: Schema.String,
  summary: Schema.String,
  workUnitIds: Schema.Array(Schema.String),
  generatedAt: Schema.String,
  status: SummaryStatusSchema,
}).annotations({ identifier: "DailySummary" });
