import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractDiscordIdentities } from "../src/identity-extractor";
import type { DiscordMessage, DiscordMessageEnvelope } from "../src/types";

const sampleMessage: DiscordMessage = {
  id: "1234567890123456789",
  channel_id: "channel-001",
  author: {
    id: "user-001",
    username: "johndoe",
    global_name: "John Doe",
  },
  content: "Hello world",
  timestamp: "2026-04-30T10:00:00Z",
  guild_id: "guild-001",
};

const sampleEnvelope: DiscordMessageEnvelope = {
  guildId: "guild-001",
  channel: { id: "channel-001", name: "dev-chat" },
  message: sampleMessage,
};

describe("extractDiscordIdentities", () => {
  it("extracts identity from message author", async () => {
    const result = await Effect.runPromise(
      extractDiscordIdentities(sampleEnvelope)
    );

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe("user-001");
    expect(result[0].username).toBe("johndoe");
    expect(result[0].displayName).toBe("John Doe");
    expect(result[0].source).toBe("discord");
  });

  it("uses username as displayName when global_name is missing", async () => {
    const envelope: DiscordMessageEnvelope = {
      ...sampleEnvelope,
      message: {
        ...sampleMessage,
        author: {
          id: "user-002",
          username: "janedoe",
        },
      },
    };

    const result = await Effect.runPromise(extractDiscordIdentities(envelope));

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("janedoe");
  });

  it("skips bot messages", async () => {
    const envelope: DiscordMessageEnvelope = {
      ...sampleEnvelope,
      message: {
        ...sampleMessage,
        author: {
          id: "bot-001",
          username: "botuser",
          bot: true,
        },
      },
    };

    const result = await Effect.runPromise(extractDiscordIdentities(envelope));

    expect(result).toHaveLength(0);
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractDiscordIdentities({ unknown: true }))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain(
        "Cannot extract identities from unknown Discord payload type"
      );
    }
  });
});
