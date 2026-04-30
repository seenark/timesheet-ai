export interface AuditLog {
  readonly action: string;
  readonly actorUserId: string;
  readonly id: string;
  readonly newValue?: unknown;
  readonly organizationId: string;
  readonly previousValue?: unknown;
  readonly targetId: string;
  readonly targetType: string;
  readonly timestamp: string;
}

export interface ReviewDecision {
  readonly decision: "approved" | "flagged" | "rejected";
  readonly id: string;
  readonly note?: string;
  readonly organizationId: string;
  readonly reviewerId: string;
  readonly targetId: string;
  readonly targetType: "work-unit" | "summary" | "identity" | "mapping";
  readonly timestamp: string;
}
