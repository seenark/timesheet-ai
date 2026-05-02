# Phase 7B: Discord Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@timesheet-ai/ingestion-discord` — a Discord ingestion plugin that captures messages from configured guild channels via Gateway (real-time) and REST API (backfill), normalizing them into the internal event model.

**Architecture:** Follows the same `IngestionPlugin` pattern as `ingestion-plane`. The normalizer transforms `DiscordMessageEnvelope` (message + channel context) into `NormalizedEvent[]`. The REST API client handles backfill via `sync()`. A Gateway module manages a persistent WebSocket connection using Effect's `Scope` for lifecycle management.

**Tech Stack:** Effect-TS, Bun runtime, raw WebSocket (no discord.js), TypeScript, SurrealDB (via existing pipeline).

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `packages/ingestion-discord/package.json` | Package manifest |
| `packages/ingestion-discord/tsconfig.json` | TypeScript config |
| `packages/ingestion-discord/src/types.ts` | Discord API types + config + Gateway op codes |
| `packages/ingestion-discord/src/normalizer.ts` | Discord message → `NormalizedEvent[]` |
| `packages/ingestion-discord/src/identity-extractor.ts` | Extract `ExternalIdentityCandidate` from messages |
| `packages/ingestion-discord/src/scope-extractor.ts` | Extract server + channel scope |
| `packages/ingestion-discord/src/api-client.ts` | REST client for backfill |
| `packages/ingestion-discord/src/gateway.ts` | Gateway WebSocket connection + lifecycle |
| `packages/ingestion-discord/src/plugin.ts` | `DiscordIngestionPlugin` implementing `IngestionPlugin` |
| `packages/ingestion-discord/src/index.ts` | Barrel exports |
| `packages/ingestion-discord/tests/normalizer.test.ts` | Normalizer tests |
| `packages/ingestion-discord/tests/identity-extractor.test.ts` | Identity extractor tests |
| `packages/ingestion-discord/tests/scope-extractor.test.ts` | Scope extractor tests |
| `packages/ingestion-discord/tests/gateway.test.ts` | Gateway message handling tests |

### Files to modify

| File | Change |
|------|--------|
| `apps/worker/package.json` | Add `@timesheet-ai/ingestion-discord` dependency |
| `apps/worker/src/index.ts` | Register plugin, start Gateway connections |

---

## Task 1: Scaffold Package

**Files:**
- Create: `packages/ingestion-discord/package.json`
- Create: `packages/ingestion-discord/tsconfig.json`

- [ ] **Step 1: Create `packages/ingestion-discord/package.json`**

```json
{
  "name": "@timesheet-ai/ingestion-discord",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/ingestion-core": "workspace:*",
    "@timesheet-ai/observability": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create `packages/ingestion-discord/tsconfig.json`**

```json
{
  "extends": "@timesheet-ai/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Run `bun install`**

Run: `bun install`
Expected: Lockfile updated with `@timesheet-ai/ingestion-discord`.

- [ ] **Step 4: Commit**

```bash
git add packages/ingestion-discord/package.json packages/ingestion-discord/tsconfig.json bun.lock
git commit -m "chore(ingestion-discord): scaffold package"
```

---

## Task 2: Define Discord API Types

**Files:**
- Create: `packages/ingestion-discord/src/types.ts`

- [ ] **Step 1: Create `packages/ingestion-discord/src/types.ts`**

```ts
export interface DiscordUser {
  readonly bot?: boolean;
  readonly global_name?: string;
  readonly id: string;
  readonly username: string;
}

export interface DiscordMessage {
  readonly author: DiscordUser;
  readonly channel_id: string;
  readonly content: string;
  readonly guild_id?: string;
  readonly id: string;
  readonly timestamp: string;
}

export interface DiscordChannel {
  readonly guild_id?: string;
  readonly id: string;
  readonly name?: string;
}

export interface DiscordGuild {
  readonly id: string;
  readonly name: string;
}

export interface DiscordMessageEnvelope {
  readonly channel: {
    readonly id: string;
    readonly name: string;
  };
  readonly guildId: string;
  readonly message: DiscordMessage;
}

export interface DiscordConfig {
  readonly botToken: string;
  readonly channelIds: readonly string[];
  readonly guildId: string;
}

export interface GatewayPayload {
  readonly d?: unknown;
  readonly op: number;
  readonly s?: number | null;
  readonly t?: string | null;
}

export interface GatewayHello {
  readonly heartbeat_interval: number;
}

export interface GatewayIdentify {
  readonly d: {
    readonly intents: number;
    readonly properties: {
      readonly browser: string;
      readonly device: string;
      readonly os: string;
    };
    readonly token: string;
  };
  readonly op: 2;
}

export interface GatewayResume {
  readonly d: {
    readonly session_id: string;
    readonly seq: number | null;
    readonly token: string;
  };
  readonly op: 6;
}

export const GATEWAY_INTENTS = {
  GUILD_MESSAGES: 1 << 9,
  MESSAGE_CONTENT: 1 << 15,
} as const;

export const GATEWAY_OPCODES = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export type DiscordCursor = Record<string, string>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/ingestion-discord/src/types.ts
git commit -m "feat(ingestion-discord): add Discord API types"
```

---

## Task 3: Write and Test Normalizer

**Files:**
- Create: `packages/ingestion-discord/tests/normalizer.test.ts`
- Create: `packages/ingestion-discord/src/normalizer.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-discord/tests/normalizer.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizeDiscordPayload } from "../src/normalizer";
import type {
  DiscordMessage,
  DiscordMessageEnvelope,
} from "../src/types";

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

    const result = await Effect.runPromise(
      normalizeDiscordPayload(envelope)
    );

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

    const result = await Effect.runPromise(
      normalizeDiscordPayload(envelope)
    );

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

    const result = await Effect.runPromise(
      normalizeDiscordPayload(envelope)
    );

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

    const result = await Effect.runPromise(
      normalizeDiscordPayload(envelope)
    );

    expect(result).toHaveLength(1);
    expect(result[0].content.channelName).toBe("channel-001");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-discord/`
Expected: FAIL — `normalizeDiscordPayload` is not defined.

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-discord/src/normalizer.ts`:

```ts
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

    const event: Omit<
      NormalizedEvent,
      "id" | "organizationId" | "ingestedAt"
    > = {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ingestion-discord/`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/normalizer.ts packages/ingestion-discord/tests/normalizer.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-discord/src/normalizer.ts packages/ingestion-discord/tests/normalizer.test.ts
git commit -m "feat(ingestion-discord): add normalizer with tests"
```

---

## Task 4: Write and Test Identity Extractor

**Files:**
- Create: `packages/ingestion-discord/tests/identity-extractor.test.ts`
- Create: `packages/ingestion-discord/src/identity-extractor.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-discord/tests/identity-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractDiscordIdentities } from "../src/identity-extractor";
import type {
  DiscordMessage,
  DiscordMessageEnvelope,
} from "../src/types";

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

    const result = await Effect.runPromise(
      extractDiscordIdentities(envelope)
    );

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

    const result = await Effect.runPromise(
      extractDiscordIdentities(envelope)
    );

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-discord/`
Expected: FAIL — `extractDiscordIdentities` is not defined.

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-discord/src/identity-extractor.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ingestion-discord/`
Expected: 10 pass (6 normalizer + 4 identity), 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/identity-extractor.ts packages/ingestion-discord/tests/identity-extractor.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-discord/src/identity-extractor.ts packages/ingestion-discord/tests/identity-extractor.test.ts
git commit -m "feat(ingestion-discord): add identity extractor with tests"
```

---

## Task 5: Write and Test Scope Extractor

**Files:**
- Create: `packages/ingestion-discord/tests/scope-extractor.test.ts`
- Create: `packages/ingestion-discord/src/scope-extractor.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-discord/tests/scope-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractDiscordScopes } from "../src/scope-extractor";
import type {
  DiscordMessage,
  DiscordMessageEnvelope,
} from "../src/types";

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
    expect(server!.externalScopeId).toBe("guild-001");

    const channel = result.find((s) => s.scopeType === "channel");
    expect(channel).toBeDefined();
    expect(channel!.externalScopeId).toBe("channel-001");
    expect(channel!.name).toBe("dev-chat");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-discord/`
Expected: FAIL — `extractDiscordScopes` is not defined.

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-discord/src/scope-extractor.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ingestion-discord/`
Expected: 12 pass (6 + 4 + 2), 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/scope-extractor.ts packages/ingestion-discord/tests/scope-extractor.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-discord/src/scope-extractor.ts packages/ingestion-discord/tests/scope-extractor.test.ts
git commit -m "feat(ingestion-discord): add scope extractor with tests"
```

---

## Task 6: Write REST API Client

**Files:**
- Create: `packages/ingestion-discord/src/api-client.ts`

- [ ] **Step 1: Write the implementation**

Create `packages/ingestion-discord/src/api-client.ts`:

```ts
import type {
  DiscordChannel,
  DiscordConfig,
  DiscordCursor,
  DiscordGuild,
  DiscordMessage,
} from "./types";

const DISCORD_API_BASE = "https://discord.com/api/v10";

const fetchJSON = async <T>(
  url: string,
  token: string
): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Discord API error: ${response.status} ${response.statusText}`
    );
  }
  if (response.status === 204) {
    return [] as T;
  }
  return response.json() as Promise<T>;
};

export const fetchChannelMessages = async (
  config: DiscordConfig,
  channelId: string,
  after?: string
): Promise<readonly DiscordMessage[]> => {
  let url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=100`;
  if (after) {
    url += `&after=${after}`;
  }
  const messages = await fetchJSON<DiscordMessage[]>(url, config.botToken);
  return messages.reverse();
};

export const fetchChannel = async (
  config: DiscordConfig,
  channelId: string
): Promise<DiscordChannel> => {
  return fetchJSON<DiscordChannel>(
    `${DISCORD_API_BASE}/channels/${channelId}`,
    config.botToken
  );
};

export const fetchGuild = async (
  config: DiscordConfig
): Promise<DiscordGuild> => {
  return fetchJSON<DiscordGuild>(
    `${DISCORD_API_BASE}/guilds/${config.guildId}`,
    config.botToken
  );
};

export const buildCursor = (
  currentCursor: DiscordCursor | undefined,
  channelId: string,
  lastMessageId: string
): DiscordCursor => {
  const base = currentCursor ?? {};
  return { ...base, [channelId]: lastMessageId };
};
```

- [ ] **Step 2: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/api-client.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/ingestion-discord/src/api-client.ts
git commit -m "feat(ingestion-discord): add Discord REST API client"
```

---

## Task 7: Write Gateway Connection

**Files:**
- Create: `packages/ingestion-discord/src/gateway.ts`
- Create: `packages/ingestion-discord/tests/gateway.test.ts`

This is the most complex module. The Gateway manages a persistent WebSocket connection to Discord. The test focuses on the message handling logic (filtering, envelope construction) rather than the WebSocket lifecycle itself.

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion-discord/tests/gateway.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type {
  DiscordMessage,
  DiscordMessageEnvelope,
} from "../src/types";
import {
  GATEWAY_INTENTS,
  GATEWAY_OPCODES,
} from "../src/types";
import { buildMessageEnvelope, shouldProcessMessage } from "../src/gateway";

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
    expect(
      shouldProcessMessage(sampleMessage, allowedChannelIds)
    ).toBeTrue();
  });

  it("rejects bot messages", () => {
    const botMessage: DiscordMessage = {
      ...sampleMessage,
      author: { id: "bot-001", username: "botuser", bot: true },
    };
    expect(
      shouldProcessMessage(botMessage, allowedChannelIds)
    ).toBeFalse();
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
    const envelope = buildMessageEnvelope(
      sampleMessage,
      channelName
    );

    expect(envelope.guildId).toBe("guild-001");
    expect(envelope.channel.id).toBe("channel-001");
    expect(envelope.channel.name).toBe("dev-chat");
    expect(envelope.message).toBe(sampleMessage);
  });

  it("uses channel_id as fallback name when channel name is empty", () => {
    const envelope = buildMessageEnvelope(
      sampleMessage,
      ""
    );

    expect(envelope.channel.name).toBe("channel-001");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ingestion-discord/`
Expected: FAIL — `shouldProcessMessage` and `buildMessageEnvelope` are not defined.

- [ ] **Step 3: Write the implementation**

Create `packages/ingestion-discord/src/gateway.ts`:

```ts
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect, Scope } from "effect";
import type {
  DiscordConfig,
  DiscordMessage,
  DiscordMessageEnvelope,
  GatewayHello,
  GatewayIdentify,
  GatewayPayload,
} from "./types";
import {
  GATEWAY_INTENTS,
  GATEWAY_OPCODES,
} from "./types";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 1000;

export const shouldProcessMessage = (
  message: DiscordMessage,
  allowedChannelIds: readonly string[]
): boolean => {
  if (message.author.bot) {
    return false;
  }
  return allowedChannelIds.includes(message.channel_id);
};

export const buildMessageEnvelope = (
  message: DiscordMessage,
  channelName: string
): DiscordMessageEnvelope => ({
  channel: {
    id: message.channel_id,
    name: channelName || message.channel_id,
  },
  guildId: message.guild_id ?? "",
  message,
});

interface GatewayState {
  heartbeatIntervalMs: number | null;
  sequence: number | null;
  sessionId: string | null;
  ws: WebSocket | null;
}

const buildIdentifyPayload = (
  token: string
): GatewayIdentify => ({
  d: {
    intents: GATEWAY_INTENTS.GUILD_MESSAGES | GATEWAY_INTENTS.MESSAGE_CONTENT,
    properties: {
      browser: "timesheet-ai",
      device: "timesheet-ai",
      os: "bun",
    },
    token,
  },
  op: GATEWAY_OPCODES.IDENTIFY,
});

const handleGatewayPayload = (
  payload: GatewayPayload,
  state: GatewayState,
  config: DiscordConfig,
  onMessage: (envelope: DiscordMessageEnvelope) => Effect.Effect<void>,
  channelNames: Map<string, string>
): void => {
  if (payload.s != null) {
    state.sequence = payload.s;
  }

  switch (payload.op) {
    case GATEWAY_OPCODES.HELLO: {
      const hello = payload.d as GatewayHello;
      state.heartbeatIntervalMs = hello.heartbeat_interval;
      break;
    }
    case GATEWAY_OPCODES.DISPATCH: {
      if (payload.t === "MESSAGE_CREATE") {
        const message = payload.d as DiscordMessage;
        if (shouldProcessMessage(message, config.channelIds)) {
          const channelName =
            channelNames.get(message.channel_id) ?? message.channel_id;
          const envelope = buildMessageEnvelope(message, channelName);
          Effect.runFork(onMessage(envelope));
        }
      }
      if (payload.t === "READY") {
        const readyData = payload.d as { session_id: string };
        state.sessionId = readyData.session_id;
        Effect.runFork(
          logInfo("Discord Gateway connected", {
            guildId: config.guildId,
          })
        );
      }
      break;
    }
    case GATEWAY_OPCODES.RECONNECT: {
      Effect.runFork(
        logWarn("Discord Gateway reconnect requested", {
          guildId: config.guildId,
        })
      );
      state.ws?.close();
      break;
    }
    case GATEWAY_OPCODES.INVALID_SESSION: {
      state.sessionId = null;
      state.ws?.close();
      break;
    }
    case GATEWAY_OPCODES.HEARTBEAT_ACK: {
      break;
    }
  }
};

export const startGateway = (
  config: DiscordConfig,
  onMessage: (envelope: DiscordMessageEnvelope) => Effect.Effect<void>,
  channelNames?: Map<string, string>
): Effect.Effect<WebSocket, IngestionError, Scope.Scope> =>
  Effect.gen(function* () {
    const names = channelNames ?? new Map<string, string>();
    const state: GatewayState = {
      heartbeatIntervalMs: null,
      sequence: null,
      sessionId: null,
      ws: null,
    };

    const ws = new WebSocket(GATEWAY_URL);
    state.ws = ws;

    const heartbeatFiber = yield* Effect.fork(
      Effect.gen(function* () {
        yield* Effect.sleep(1000);
        while (state.heartbeatIntervalMs != null) {
          if (
            state.ws?.readyState === WebSocket.OPEN &&
            state.sequence != null
          ) {
            const heartbeat = JSON.stringify({
              d: state.sequence,
              op: GATEWAY_OPCODES.HEARTBEAT,
            });
            state.ws.send(heartbeat);
          }
          yield* Effect.sleep(state.heartbeatIntervalMs);
        }
      })
    );

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data as string) as GatewayPayload;

      if (payload.op === GATEWAY_OPCODES.HELLO) {
        const identify = buildIdentifyPayload(config.botToken);
        ws.send(JSON.stringify(identify));
      }

      handleGatewayPayload(payload, state, config, onMessage, names);
    });

    ws.addEventListener("close", () => {
      Effect.runFork(heartbeatFiber.interrupt);
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        ws.close();
      })
    );

    return ws;
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ingestion-discord/`
Expected: 17 pass (12 + 5 gateway), 0 fail.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/gateway.ts packages/ingestion-discord/tests/gateway.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-discord/src/gateway.ts packages/ingestion-discord/tests/gateway.test.ts
git commit -m "feat(ingestion-discord): add Gateway connection with message handling tests"
```

---

## Task 8: Write Plugin and Barrel Exports

**Files:**
- Create: `packages/ingestion-discord/src/plugin.ts`
- Create: `packages/ingestion-discord/src/index.ts`

- [ ] **Step 1: Write the plugin**

Create `packages/ingestion-discord/src/plugin.ts`:

```ts
import type { Source } from "@timesheet-ai/domain";
import type {
  IngestionPlugin,
  IngestionResult,
} from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import {
  buildCursor,
  fetchChannel,
  fetchChannelMessages,
} from "./api-client";
import { extractDiscordIdentities } from "./identity-extractor";
import { normalizeDiscordPayload } from "./normalizer";
import { extractDiscordScopes } from "./scope-extractor";
import type { DiscordConfig, DiscordCursor, DiscordMessageEnvelope } from "./types";

const DISCORD_SOURCE: Source = "discord";

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

      const parsedCursor: DiscordCursor = cursor
        ? JSON.parse(cursor)
        : {};

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
            fetchChannelMessages(
              config,
              channelId,
              parsedCursor[channelId]
            )
          );

          if (messages.length === 0) {
            continue;
          }

          rawPayloadCount += messages.length;

          for (const message of messages) {
            const envelope: DiscordMessageEnvelope = {
              channel: {
                id: channelId,
                name: channel.name ?? channelId,
              },
              guildId: config.guildId,
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

            const idResult = yield* Effect.either(
              extractDiscordIdentities(envelope)
            );
            if (idResult._tag === "Right") {
              newIdentityCandidates += idResult.right.length;
            }

            newCursor[channelId] = message.id;
          }
        }

        return {
          cursor:
            rawPayloadCount > 0
              ? JSON.stringify(newCursor)
              : cursor ?? "{}",
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
```

- [ ] **Step 2: Write barrel exports**

Create `packages/ingestion-discord/src/index.ts`:

```ts
export { extractDiscordIdentities } from "./identity-extractor";
export { normalizeDiscordPayload } from "./normalizer";
export { DiscordIngestionPlugin } from "./plugin";
export { extractDiscordScopes } from "./scope-extractor";
export type {
  DiscordConfig,
  DiscordMessage,
  DiscordMessageEnvelope,
} from "./types";
```

- [ ] **Step 3: Run all tests**

Run: `bun test packages/ingestion-discord/`
Expected: 17 pass, 0 fail.

- [ ] **Step 4: Run typecheck**

Run: `bun run --cwd packages/ingestion-discord check-types`
Expected: No errors.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix packages/ingestion-discord/src/`

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-discord/src/plugin.ts packages/ingestion-discord/src/index.ts
git commit -m "feat(ingestion-discord): add DiscordIngestionPlugin with sync support"
```

---

## Task 9: Register Plugin in Worker

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add dependency to `apps/worker/package.json`**

Add to `dependencies`:
```
"@timesheet-ai/ingestion-discord": "workspace:*",
```

- [ ] **Step 2: Update `apps/worker/src/index.ts`**

Add import:
```ts
import { DiscordIngestionPlugin } from "@timesheet-ai/ingestion-discord";
```

Add registration after existing plugin registrations:
```ts
registerPlugin(DiscordIngestionPlugin);
```

Update the plugins list in the logInfo call from `["git"]` to `["git", "plane", "discord"]`.

- [ ] **Step 3: Run `bun install`**

Run: `bun install`

- [ ] **Step 4: Run typecheck**

Run: `bun run --cwd apps/worker check-types`
Expected: No errors.

- [ ] **Step 5: Run lint**

Run: `bun x ultracite fix apps/worker/src/index.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/worker/package.json apps/worker/src/index.ts bun.lock
git commit -m "feat(worker): register DiscordIngestionPlugin"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (138 existing + 17 new = 155 total).

- [ ] **Step 2: Run typecheck on all changed packages**

Run: `bun run --cwd packages/ingestion-discord check-types && bun run --cwd apps/worker check-types`
Expected: No errors.

- [ ] **Step 3: Run lint on all changed files**

Run: `bun x ultracite check packages/ingestion-discord/src/ apps/worker/src/`
Expected: Only barrel file warning on `index.ts` (expected/acceptable).

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge phase-7b-discord-ingestion --no-edit
git push
```

---

## Cursor Deviation Note

The spec says the cursor format uses ISO timestamps per channel. The implementation uses Discord snowflake message IDs instead, because:

1. Discord's REST API `after` parameter expects snowflake IDs natively
2. Snowflakes encode timestamps (can be extracted if needed)
3. No timestamp-to-snowflake conversion overhead
4. More precise deduplication (message-level, not second-level)

Cursor format (actual): `Record<channelId, lastMessageSnowflakeId>`
