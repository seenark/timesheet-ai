import { Schema } from "effect";

export const AuditLogSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  action: Schema.String,
  actorUserId: Schema.String,
  targetType: Schema.String,
  targetId: Schema.String,
  previousValue: Schema.optional(Schema.Unknown),
  newValue: Schema.optional(Schema.Unknown),
  timestamp: Schema.String,
}).annotations({ identifier: "AuditLog" });

export const ReviewDecisionSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  reviewerId: Schema.String,
  targetType: Schema.Literal("work-unit", "summary", "identity", "mapping"),
  targetId: Schema.String,
  decision: Schema.Literal("approved", "flagged", "rejected"),
  note: Schema.optional(Schema.String),
  timestamp: Schema.String,
}).annotations({ identifier: "ReviewDecision" });
