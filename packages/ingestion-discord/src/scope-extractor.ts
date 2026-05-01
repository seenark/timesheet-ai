import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { DiscordMessageEnvelope } from "./types";

const isMessageEnvelope = (
  payload: unknown
): payload is DiscordMessageEnvelope => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.message === "object" &&
    p.message !== null &&
    typeof p.channel === "object" &&
    p.channel !== null
  );
};

export const extractDiscordScopes = (
  rawPayload: unknown
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isMessageEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract scopes from unknown Discord payload type",
          source: "discord",
        })
      );
    }

    return [
      {
        externalScopeId: rawPayload.guildId,
        name: rawPayload.guildId,
        scopeType: "server" as const,
      },
      {
        externalScopeId: rawPayload.channel.id,
        name: rawPayload.channel.name || rawPayload.channel.id,
        scopeType: "channel" as const,
      },
    ];
  });
