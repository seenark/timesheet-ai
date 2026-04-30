import { Schema } from "effect";
import { ProjectStatusSchema, ProjectTypeSchema } from "./enums";

export const ProjectSchema = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  name: Schema.String,
  code: Schema.String,
  type: ProjectTypeSchema,
  status: ProjectStatusSchema,
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
  createdAt: Schema.String,
}).annotations({ identifier: "Project" });

export const CreateProjectSchema = Schema.Struct({
  organizationId: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1)),
  code: Schema.String.pipe(Schema.minLength(1)),
  type: ProjectTypeSchema,
}).annotations({ identifier: "CreateProjectInput" });
