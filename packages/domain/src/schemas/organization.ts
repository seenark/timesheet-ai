import { Schema } from "effect";

export const OrganizationSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  createdAt: Schema.String,
}).annotations({ identifier: "Organization" });

export const CreateOrganizationSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  slug: Schema.String.pipe(Schema.minLength(1)),
}).annotations({ identifier: "CreateOrganizationInput" });
