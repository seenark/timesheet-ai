export type IngestionEventType =
  | "sync.started"
  | "sync.completed"
  | "sync.failed"
  | "normalize.started"
  | "normalize.completed"
  | "normalize.failed"
  | "identity.candidate.found";

export interface IngestionEvent {
  readonly connectionId: string;
  readonly metadata?: Record<string, unknown>;
  readonly source: string;
  readonly timestamp: string;
  readonly type: IngestionEventType;
}
