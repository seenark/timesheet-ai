import type { NormalizedEvent, Source } from "@timesheet-ai/domain";

export interface IngestionResult {
  readonly rawPayloadCount: number;
  readonly normalizedEventCount: number;
  readonly newIdentityCandidates: number;
  readonly cursor?: string;
  readonly errors: readonly IngestionError[];
}

export interface IngestionError {
  readonly message: string;
  readonly source: string;
  readonly externalId?: string;
  readonly raw?: unknown;
}

export interface ExternalIdentityCandidate {
  readonly source: Source;
  readonly externalId: string;
  readonly username?: string;
  readonly email?: string;
  readonly displayName?: string;
}

export interface SourceScopeCandidate {
  readonly scopeType: "repo" | "workspace" | "board" | "channel" | "server";
  readonly externalScopeId: string;
  readonly name?: string;
}

export interface IngestionPlugin {
  readonly source: Source;

  sync(connectionId: string, cursor?: string): Promise<IngestionResult>;

  normalize(rawPayload: unknown): Promise<NormalizedEvent[]>;

  extractIdentities(rawPayload: unknown): Promise<ExternalIdentityCandidate[]>;

  extractScopes(rawPayload: unknown): Promise<SourceScopeCandidate[]>;
}