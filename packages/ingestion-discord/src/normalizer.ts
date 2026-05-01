import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { DiscordMessageEnvelope } from "./types";

const DISCORD_SOURCE: Source = "discord";

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

export const normalizeDiscordPayload = (
  rawPayload: unknown
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (!isMessageEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Unknown Discord payload type",
          source: "discord",
        })
      );
    }

    const { message, channel, guildId } = rawPayload;

    if (message.author.bot) {
      return [];
    }

    const channelName = channel.name || channel.id;

    const event: Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> =
      {
        source: DISCORD_SOURCE,
        sourceEventType: "message",
        eventTime: message.timestamp,
        content: {
          message: message.content,
          channelName,
        },
        externalIdentityId: message.author.id,
        sourceRef: {
          connectionId: "",
          externalEventId: message.id,
          externalScopeId: channel.id,
          externalUrl: `https://discord.com/channels/${guildId}/${channel.id}/${message.id}`,
        },
        attribution: {
          attributionMethod: "direct",
        },
        processingVersion: 1,
      };

    return [event] as NormalizedEvent[];
  });
