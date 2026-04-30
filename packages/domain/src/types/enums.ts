export type Source = "git" | "plane" | "discord";

export type ProjectType = "client" | "internal";
export type ProjectStatus = "active" | "archived";

export type UserRole = "admin" | "manager" | "member";

export type IdentityStatus = "matched" | "suggested" | "unmatched" | "ignored";

export type MappingType = "manual" | "rule" | "inferred";
export type AttributionMethod = "manual" | "rule" | "inferred" | "direct";

export type IntegrationStatus = "active" | "paused" | "error";
export type ExternalScopeType = "repo" | "workspace" | "board" | "channel" | "server";

export type ReviewStatus = "draft" | "reviewed" | "approved" | "flagged";

export type JobStatus = "pending" | "running" | "completed" | "failed";
export type RecomputeLevel = "enrichment" | "session" | "cluster" | "work-unit" | "summary";

export type SummaryScopeType = "user" | "project";
export type SummaryStatus = "draft" | "reviewed" | "approved";