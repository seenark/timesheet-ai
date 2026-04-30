import type { NormalizedEvent, Source } from "@timesheet-ai/domain";

export interface IngestionResult {
  readonly cursor?: string;
  readonly errors: readonly IngestionError[];
  readonly newIdentityCandidates: number;
  readonly normalizedEventCount: number;
  readonly rawPayloadCount: number;
}

export interface IngestionError {
  readonly externalId?: string;
  readonly message: string;
  readonly raw?: unknown;
  readonly source: string;
}

export interface ExternalIdentityCandidate {
  readonly displayName?: string;
  readonly email?: string;
  readonly externalId: string;
  readonly source: Source;
  readonly username?: string;
}

export interface SourceScopeCandidate {
  readonly externalScopeId: string;
  readonly name?: string;
  readonly scopeType: "repo" | "workspace" | "board" | "channel" | "server";
}

export interface IngestionPlugin {
  extractIdentities(rawPayload: unknown): Promise<ExternalIdentityCandidate[]>;

  extractScopes(rawPayload: unknown): Promise<SourceScopeCandidate[]>;

  normalize(rawPayload: unknown): Promise<NormalizedEvent[]>;
  readonly source: Source;

  sync(connectionId: string, cursor?: string): Promise<IngestionResult>;
}
