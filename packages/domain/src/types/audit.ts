export interface AuditLog {
  readonly id: string;
  readonly organizationId: string;
  readonly action: string;
  readonly actorUserId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly timestamp: string;
}

export interface ReviewDecision {
  readonly id: string;
  readonly organizationId: string;
  readonly reviewerId: string;
  readonly targetType: "work-unit" | "summary" | "identity" | "mapping";
  readonly targetId: string;
  readonly decision: "approved" | "flagged" | "rejected";
  readonly note?: string;
  readonly timestamp: string;
}