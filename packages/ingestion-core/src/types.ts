import { Data, Effect } from "effect";
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";

export interface IngestionResult {
  readonly cursor?: string;
  readonly errors: readonly IngestionError[];
  readonly newIdentityCandidates: number;
  readonly normalizedEventCount: number;
  readonly rawPayloadCount: number;
}

export class IngestionError extends Data.TaggedError("IngestionError")<{
  readonly message: string;
  readonly source: string;
  readonly externalId?: string;
  readonly raw?: unknown;
}> {}

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
  extractIdentities(
    rawPayload: unknown,
  ): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError>;
  extractScopes(
    rawPayload: unknown,
  ): Effect.Effect<readonly SourceScopeCandidate[], IngestionError>;
  normalize(
    rawPayload: unknown,
  ): Effect.Effect<readonly NormalizedEvent[], IngestionError>;
  readonly source: Source;
  sync(
    connectionId: string,
    cursor?: string,
  ): Effect.Effect<IngestionResult, IngestionError>;
}
