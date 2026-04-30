import { Schema } from "effect";
import { UserRoleSchema } from "./enums";

export const CanonicalUserSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  displayName: Schema.String,
  primaryEmail: Schema.optional(Schema.String),
  role: UserRoleSchema,
  active: Schema.Boolean,
  createdAt: Schema.String,
}).annotations({ identifier: "CanonicalUser" });

export const CreateUserSchema = Schema.Struct({
  organizationId: Schema.String,
  displayName: Schema.String.pipe(Schema.minLength(1)),
  primaryEmail: Schema.optional(Schema.String),
  role: UserRoleSchema,
}).annotations({ identifier: "CreateUserInput" });
