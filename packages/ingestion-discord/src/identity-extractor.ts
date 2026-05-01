import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
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

export const extractDiscordIdentities = (
  rawPayload: unknown
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isMessageEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message:
            "Cannot extract identities from unknown Discord payload type",
          source: "discord",
        })
      );
    }

    if (rawPayload.message.author.bot) {
      return [];
    }

    const { author } = rawPayload.message;

    return [
      {
        displayName: author.global_name ?? author.username,
        externalId: author.id,
        source: "discord",
        username: author.username,
      },
    ];
  });
