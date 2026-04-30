export type IngestionEventType =
  | "sync.started"
  | "sync.completed"
  | "sync.failed"
  | "normalize.started"
  | "normalize.completed"
  | "normalize.failed"
  | "identity.candidate.found";

export interface IngestionEvent {
  readonly type: IngestionEventType;
  readonly source: string;
  readonly connectionId: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}