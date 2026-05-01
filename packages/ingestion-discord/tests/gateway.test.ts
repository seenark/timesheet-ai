import { describe, expect, it } from "bun:test";
import { buildMessageEnvelope, shouldProcessMessage } from "../src/gateway";
import type { DiscordMessage } from "../src/types";

const sampleMessage: DiscordMessage = {
  id: "1234567890123456789",
  channel_id: "channel-001",
  author: {
    id: "user-001",
    username: "johndoe",
  },
  content: "Hello world",
  timestamp: "2026-04-30T10:00:00Z",
  guild_id: "guild-001",
};

describe("shouldProcessMessage", () => {
  const allowedChannelIds = ["channel-001", "channel-002"];

  it("allows messages from allowed channels by non-bots", () => {
    expect(shouldProcessMessage(sampleMessage, allowedChannelIds)).toBeTrue();
  });

  it("rejects bot messages", () => {
    const botMessage: DiscordMessage = {
      ...sampleMessage,
      author: { id: "bot-001", username: "botuser", bot: true },
    };
    expect(shouldProcessMessage(botMessage, allowedChannelIds)).toBeFalse();
  });

  it("rejects messages from non-allowed channels", () => {
    const otherChannelMessage: DiscordMessage = {
      ...sampleMessage,
      channel_id: "channel-999",
    };
    expect(
      shouldProcessMessage(otherChannelMessage, allowedChannelIds)
    ).toBeFalse();
  });
});

describe("buildMessageEnvelope", () => {
  it("builds envelope from gateway dispatch data", () => {
    const channelName = "dev-chat";
    const envelope = buildMessageEnvelope(sampleMessage, channelName);

    expect(envelope.guildId).toBe("guild-001");
    expect(envelope.channel.id).toBe("channel-001");
    expect(envelope.channel.name).toBe("dev-chat");
    expect(envelope.message).toBe(sampleMessage);
  });

  it("uses channel_id as fallback name when channel name is empty", () => {
    const envelope = buildMessageEnvelope(sampleMessage, "");

    expect(envelope.channel.name).toBe("channel-001");
  });
});
