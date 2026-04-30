import { Schema } from "effect";
import { IdentityStatusSchema, SourceSchema } from "./enums";

export const ExternalIdentitySchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  source: SourceSchema,
  externalId: Schema.String,
  username: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  canonicalUserId: Schema.optional(Schema.String),
  confidence: Schema.optional(Schema.Number),
  status: IdentityStatusSchema,
  createdAt: Schema.String,
}).annotations({ identifier: "ExternalIdentity" });
