import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizeDiscordPayload } from "../src/normalizer";
import type { DiscordMessage, DiscordMessageEnvelope } from "../src/types";

const sampleMessage: DiscordMessage = {
  id: "1234567890123456789",
  channel_id: "channel-001",
  author: {
    id: "user-001",
    username: "johndoe",
    global_name: "John Doe",
  },
  content: "Hey team, I just pushed the auth feature. Please review!",
  timestamp: "2026-04-30T10:00:00Z",
  guild_id: "guild-001",
};

const sampleEnvelope: DiscordMessageEnvelope = {
  guildId: "guild-001",
  channel: {
    id: "channel-001",
    name: "dev-chat",
  },
  message: sampleMessage,
};

describe("normalizeDiscordPayload", () => {
  it("normalizes a Discord message envelope into an event", async () => {
    const result = await Effect.runPromise(
      normalizeDiscordPayload(sampleEnvelope)
    );

    expect(result).toHaveLength(1);

    const event = result[0];
    expect(event.source).toBe("discord");
    expect(event.sourceEventType).toBe("message");
    expect(event.eventTime).toBe("2026-04-30T10:00:00Z");
    expect(event.content.message).toBe(
      "Hey team, I just pushed the auth feature. Please review!"
    );
    expect(event.content.channelName).toBe("dev-chat");
    expect(event.sourceRef.externalEventId).toBe("1234567890123456789");
    expect(event.sourceRef.externalScopeId).toBe("channel-001");
    expect(event.sourceRef.externalUrl).toBe(
      "https://discord.com/channels/guild-001/channel-001/1234567890123456789"
    );
    expect(event.externalIdentityId).toBe("user-001");
  });

  it("uses username as fallback when global_name is missing", async () => {
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

    const result = await Effect.runPromise(normalizeDiscordPayload(envelope));

    expect(result).toHaveLength(1);
    expect(result[0].externalIdentityId).toBe("user-002");
  });

  it("filters out bot messages", async () => {
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

    const result = await Effect.runPromise(normalizeDiscordPayload(envelope));

    expect(result).toHaveLength(0);
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(normalizeDiscordPayload({ unknown: true }))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Unknown Discord payload type");
    }
  });

  it("handles message with empty content", async () => {
    const envelope: DiscordMessageEnvelope = {
      ...sampleEnvelope,
      message: {
        ...sampleMessage,
        content: "",
      },
    };

    const result = await Effect.runPromise(normalizeDiscordPayload(envelope));

    expect(result).toHaveLength(1);
    expect(result[0].content.message).toBe("");
  });

  it("uses channel id as fallback when channel name is missing", async () => {
    const envelope: DiscordMessageEnvelope = {
      ...sampleEnvelope,
      channel: {
        id: "channel-001",
        name: "",
      },
    };

    const result = await Effect.runPromise(normalizeDiscordPayload(envelope));

    expect(result).toHaveLength(1);
    expect(result[0].content.channelName).toBe("channel-001");
  });
});
