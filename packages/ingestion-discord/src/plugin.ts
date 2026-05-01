import type { Source } from "@timesheet-ai/domain";
import type {
  IngestionPlugin,
  IngestionResult,
} from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import { fetchChannel, fetchChannelMessages } from "./api-client";
import { extractDiscordIdentities } from "./identity-extractor";
import { normalizeDiscordPayload } from "./normalizer";
import { extractDiscordScopes } from "./scope-extractor";
import type {
  DiscordConfig,
  DiscordCursor,
  DiscordMessage,
  DiscordMessageEnvelope,
} from "./types";

const DISCORD_SOURCE: Source = "discord";

const processChannelMessages = (
  messages: readonly DiscordMessage[],
  channelId: string,
  channelName: string,
  guildId: string
): Effect.Effect<
  {
    normalizedEventCount: number;
    newIdentityCandidates: number;
    lastMessageId: string;
  },
  IngestionError
> =>
  Effect.gen(function* () {
    let normalizedEventCount = 0;
    let newIdentityCandidates = 0;
    const errors: IngestionError[] = [];

    for (const message of messages) {
      const envelope: DiscordMessageEnvelope = {
        channel: { id: channelId, name: channelName },
        guildId,
        message,
      };

      const normResult = yield* Effect.either(
        normalizeDiscordPayload(envelope)
      );
      if (normResult._tag === "Right") {
        normalizedEventCount += normResult.right.length;
      } else {
        errors.push(normResult.left);
      }

      const idResult = yield* Effect.either(extractDiscordIdentities(envelope));
      if (idResult._tag === "Right") {
        newIdentityCandidates += idResult.right.length;
      }
    }

    const lastMessageId = messages.at(-1)?.id ?? "";

    return { normalizedEventCount, newIdentityCandidates, lastMessageId };
  });

export const DiscordIngestionPlugin: IngestionPlugin = {
  source: DISCORD_SOURCE,

  normalize: normalizeDiscordPayload,

  extractIdentities: extractDiscordIdentities,

  extractScopes: extractDiscordScopes,

  sync: (
    connectionId: string,
    cursor?: string
  ): Effect.Effect<IngestionResult, IngestionError> =>
    Effect.gen(function* () {
      let config: DiscordConfig;
      try {
        config = JSON.parse(connectionId) as DiscordConfig;
      } catch {
        return yield* Effect.fail(
          new IngestionError({
            message: `Invalid Discord connection config: ${connectionId}`,
            source: "discord",
          })
        );
      }

      const parsedCursor: DiscordCursor = cursor ? JSON.parse(cursor) : {};

      try {
        let normalizedEventCount = 0;
        let newIdentityCandidates = 0;
        let rawPayloadCount = 0;
        const errors: IngestionError[] = [];
        const newCursor: DiscordCursor = { ...parsedCursor };

        for (const channelId of config.channelIds) {
          const channel = yield* Effect.promise(() =>
            fetchChannel(config, channelId)
          );

          const messages = yield* Effect.promise(() =>
            fetchChannelMessages(config, channelId, parsedCursor[channelId])
          );

          if (messages.length === 0) {
            continue;
          }

          rawPayloadCount += messages.length;

          const channelName = channel.name ?? channelId;
          const result = yield* processChannelMessages(
            messages,
            channelId,
            channelName,
            config.guildId
          );

          normalizedEventCount += result.normalizedEventCount;
          newIdentityCandidates += result.newIdentityCandidates;
          newCursor[channelId] = result.lastMessageId;
        }

        return {
          cursor:
            rawPayloadCount > 0 ? JSON.stringify(newCursor) : (cursor ?? "{}"),
          errors,
          newIdentityCandidates,
          normalizedEventCount,
          rawPayloadCount,
        };
      } catch (error) {
        return yield* Effect.fail(
          new IngestionError({
            message: `Discord sync failed: ${String(error)}`,
            source: "discord",
          })
        );
      }
    }),
};
