import { Schema } from "effect";
import { JobStatusSchema, RecomputeLevelSchema } from "./enums";

export const JobRunSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  jobType: Schema.String,
  status: JobStatusSchema,
  startedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
}).annotations({ identifier: "JobRun" });

export const RecomputeRequestSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  level: RecomputeLevelSchema,
  scope: Schema.Struct({
    userId: Schema.optional(Schema.String),
    projectId: Schema.optional(Schema.String),
    dateStart: Schema.optional(Schema.String),
    dateEnd: Schema.optional(Schema.String),
  }),
  requestedBy: Schema.String,
  requestedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  status: JobStatusSchema,
}).annotations({ identifier: "RecomputeRequest" });
