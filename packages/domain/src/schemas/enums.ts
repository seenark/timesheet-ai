import { Schema } from "effect";

export const SourceSchema = Schema.Literal("git", "plane", "discord").pipe(
  Schema.annotations({ identifier: "Source" }),
);
export type SourceType = Schema.Schema.Type<typeof SourceSchema>;

export const ProjectTypeSchema = Schema.Literal("client", "internal");
export const ProjectStatusSchema = Schema.Literal("active", "archived");
export const UserRoleSchema = Schema.Literal("admin", "manager", "member");
export const IdentityStatusSchema = Schema.Literal(
  "matched",
  "suggested",
  "unmatched",
  "ignored",
);
export const MappingTypeSchema = Schema.Literal("manual", "rule", "inferred");
export const AttributionMethodSchema = Schema.Literal(
  "manual",
  "rule",
  "inferred",
  "direct",
);
export const IntegrationStatusSchema = Schema.Literal(
  "active",
  "paused",
  "error",
);
export const ExternalScopeTypeSchema = Schema.Literal(
  "repo",
  "workspace",
  "board",
  "channel",
  "server",
);
export const ReviewStatusSchema = Schema.Literal(
  "draft",
  "reviewed",
  "approved",
  "flagged",
);
export const JobStatusSchema = Schema.Literal(
  "pending",
  "running",
  "completed",
  "failed",
);
export const RecomputeLevelSchema = Schema.Literal(
  "enrichment",
  "session",
  "cluster",
  "work-unit",
  "summary",
);
export const SummaryScopeTypeSchema = Schema.Literal("user", "project");
export const SummaryStatusSchema = Schema.Literal("draft", "reviewed", "approved");
