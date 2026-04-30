import { Schema } from "effect";
import { AttributionMethodSchema, SourceSchema } from "./enums";

export const RawEventPayloadSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  source: Schema.String,
  connectionId: Schema.String,
  externalEventId: Schema.String,
  receivedAt: Schema.String,
  payload: Schema.Unknown,
  checksum: Schema.String,
}).annotations({ identifier: "RawEventPayload" });

const SourceRefSchema = Schema.Struct({
  connectionId: Schema.String,
  externalEventId: Schema.String,
  externalScopeId: Schema.optional(Schema.String),
  externalUrl: Schema.optional(Schema.String),
});

const EventContentSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  commitSha: Schema.optional(Schema.String),
  taskId: Schema.optional(Schema.String),
  taskStatus: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
  channelName: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const AttributionSchema = Schema.Struct({
  identityConfidence: Schema.optional(Schema.Number),
  projectConfidence: Schema.optional(Schema.Number),
  attributionMethod: Schema.optional(AttributionMethodSchema),
});

export const NormalizedEventSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  source: SourceSchema,
  sourceEventType: Schema.String,
  eventTime: Schema.String,
  ingestedAt: Schema.String,
  externalIdentityId: Schema.optional(Schema.String),
  canonicalUserId: Schema.optional(Schema.String),
  projectId: Schema.optional(Schema.String),
  sourceRef: SourceRefSchema,
  content: EventContentSchema,
  attribution: AttributionSchema,
  processingVersion: Schema.Number,
}).annotations({ identifier: "NormalizedEvent" });
