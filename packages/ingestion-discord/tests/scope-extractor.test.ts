import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractDiscordScopes } from "../src/scope-extractor";
import type { DiscordMessage, DiscordMessageEnvelope } from "../src/types";

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

const sampleEnvelope: DiscordMessageEnvelope = {
  guildId: "guild-001",
  channel: { id: "channel-001", name: "dev-chat" },
  message: sampleMessage,
};

describe("extractDiscordScopes", () => {
  it("extracts server and channel scopes", async () => {
    const result = await Effect.runPromise(
      extractDiscordScopes(sampleEnvelope)
    );

    expect(result).toHaveLength(2);

    const server = result.find((s) => s.scopeType === "server");
    expect(server).toBeDefined();
    expect(server?.externalScopeId).toBe("guild-001");

    const channel = result.find((s) => s.scopeType === "channel");
    expect(channel).toBeDefined();
    expect(channel?.externalScopeId).toBe("channel-001");
    expect(channel?.name).toBe("dev-chat");
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractDiscordScopes({ unknown: true }))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain(
        "Cannot extract scopes from unknown Discord payload type"
      );
    }
  });
});
