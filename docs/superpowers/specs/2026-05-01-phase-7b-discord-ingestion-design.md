# Phase 7B: Discord Ingestion — Design Spec

## Overview

Build `@timesheet-ai/ingestion-discord`, a Discord ingestion plugin that captures text messages from configured guild channels and normalizes them into the internal event model. Uses Discord Gateway (WebSocket) for real-time capture and REST API for historical backfill.

## Decisions

- **Event types**: Messages only (no reactions, voice states, or message edits/deletes)
- **Connection**: Gateway (real-time) + REST API (backfill)
- **Message lifecycle**: MESSAGE_CREATE only — edits and deletes are ignored
- **Threads**: Captured alongside channel messages (no special handling)
- **Channel selection**: Config-based allowlist of channel IDs
- **Architecture**: Gateway runs in-worker using Effect Scope/Layer for lifecycle management
- **Gateway library**: Raw WebSocket with Discord Gateway protocol (no discord.js dependency)

## Package Structure

`packages/ingestion-discord/` follows `ingestion-plane` conventions:

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Discord API types (Message, Channel, Guild, User, Config) |
| `src/normalizer.ts` | Discord message to `NormalizedEvent[]` |
| `src/identity-extractor.ts` | Extract `ExternalIdentityCandidate` from messages |
| `src/scope-extractor.ts` | Extract guild (server) + channel scope |
| `src/api-client.ts` | REST client for backfill |
| `src/gateway.ts` | Gateway WebSocket connection + lifecycle |
| `src/plugin.ts` | `DiscordIngestionPlugin` implementing `IngestionPlugin` |
| `src/index.ts` | Barrel exports |

## Configuration

```ts
interface DiscordConfig {
  readonly botToken: string;
  readonly guildId: string;
  readonly channelIds: readonly string[];
}
```

Stored as JSON in `integration_connection.config`, parsed from `connectionId` in `sync()` — same pattern as Plane.

## Normalization

### Discord Message to NormalizedEvent Mapping

| NormalizedEvent field | Discord source |
|----------------------|----------------|
| `source` | `"discord"` |
| `sourceEventType` | `"message"` |
| `eventTime` | `message.timestamp` |
| `content.message` | `message.content` |
| `content.channelName` | `channel.name` |
| `externalIdentityId` | `message.author.id` |
| `sourceRef.externalEventId` | `message.id` |
| `sourceRef.externalScopeId` | `channel.id` |
| `sourceRef.externalUrl` | `https://discord.com/channels/{guild}/{channel}/{message}` |
| `sourceRef.connectionId` | from sync context |

Bot messages are filtered out (`message.author.bot === true`).

### Raw Payload Shape

The raw payload stored in `raw_event_payload.payload` is a wrapper containing the message and its channel context:

```ts
interface DiscordMessageEnvelope {
  readonly guildId: string;
  readonly channel: {
    readonly id: string;
    readonly name: string;
  };
  readonly message: DiscordMessage;
}
```

This matches the pattern used by Plane's `PlaneIssueEnvelope` — the normalizer receives the full envelope, not just the message.

## Identity Extraction

One identity per message author:

```ts
{
  externalId: message.author.id,
  username: message.author.username,
  displayName: message.author.global_name ?? message.author.username,
  source: "discord"
}
```

Bot messages are skipped (no identity extracted for bots).

## Scope Extraction

Two scopes per message:

```ts
[
  { scopeType: "server", externalScopeId: guildId, name: guildName },
  { scopeType: "channel", externalScopeId: channelId, name: channelName }
]
```

The `guildName` is resolved from the gateway's cached guild data or from a REST API call during backfill. If unavailable, it falls back to the `guildId` string.

## REST API Client

`DiscordApiClient` wraps Discord's REST API for backfill:

- `getChannelMessages(channelId, after?, limit?)` — fetch messages, oldest-first
- `getChannel(channelId)` — resolve channel metadata
- `getGuild(guildId)` — resolve guild metadata
- Base URL: `https://discord.com/api/v10`
- Auth: `Authorization: Bot {token}`
- Rate limit handling: respect `X-RateLimit-Remaining` and `Retry-After` headers

### sync() Method

1. Parse `DiscordConfig` from `connectionId`
2. For each channel in `channelIds`:
   a. Fetch messages since cursor (per-channel timestamp)
   b. Create `DiscordMessageEnvelope` for each message
   c. Run through existing pipeline (raw → dedup → normalize → store)
3. Return `IngestionResult` with counts and new cursor

Cursor format: JSON object mapping channel IDs to the ISO timestamp of the newest ingested message:

```json
{
  "channel_123": "2026-04-30T12:00:00.000Z",
  "channel_456": "2026-04-30T11:30:00.000Z"
}
```

## Gateway — Real-time Capture

### Connection Lifecycle

Managed by Effect `Layer` + `Scope`:

1. On worker startup: connect to `wss://gateway.discord.gg/?v=10&encoding=json`
2. Receive HELLO op with heartbeat interval
3. Send IDENTIFY with bot token and intents (`GUILD_MESSAGES`, `MESSAGE_CONTENT`)
4. On MESSAGE_CREATE dispatch: filter by configured channel IDs → store raw → run pipeline
5. Heartbeat at Discord-specified interval
6. On RECONNECT op: disconnect and reconnect
7. On invalid session: reconnect with exponential backoff
8. On worker shutdown: `Scope.close` triggers clean disconnect (CLOSE op)

### Gateway Intents

- `GUILD_MESSAGES` (1 << 9 = 512) — MESSAGE_CREATE, MESSAGE_UPDATE, MESSAGE_DELETE in guilds
- `MESSAGE_CONTENT` (1 << 15 = 32768) — privileged intent, required for message content

### Message Filtering

Only process MESSAGE_CREATE events where:
- `message.author.bot` is falsy (not a bot)
- `message.channel_id` is in the configured `channelIds` allowlist

### Reconnection Strategy

- Exponential backoff: 1s, 2s, 4s, 8s, max 60s
- After reconnect, resume session using session_id + sequence number
- If resume fails, re-identify (fresh session)

## Worker Integration

Changes to `apps/worker`:

1. Add `@timesheet-ai/ingestion-discord` dependency
2. `registerPlugin(DiscordIngestionPlugin)` in `src/index.ts`
3. Gateway connections started as part of worker Effect program lifecycle

### Gateway Connection Discovery

On startup, the gateway module queries the DB for all active `integration_connection` records where `source = "discord"`. For each active connection:

1. Parse `config` JSON as `DiscordConfig`
2. Start a Gateway WebSocket connection with that config
3. Track the connection in an in-memory map keyed by connection ID

If new Discord connections are added at runtime (via admin API), the next `ingestion-sync` job cycle detects them and starts gateway connections. Removed connections trigger gateway disconnect.

### Lifecycle

The gateway lifecycle is tied to the worker's main Effect program — when the program starts, Gateway Layer is built; when the program shuts down (SIGINT/SIGTERM), Scope cleanup disconnects all active gateway connections cleanly.

## Discord API Types

Key types from Discord's API (v10):

```ts
interface DiscordMessage {
  readonly id: string;
  readonly channel_id: string;
  readonly author: DiscordUser;
  readonly content: string;
  readonly timestamp: string;
  readonly guild_id?: string;
}

interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name?: string;
  readonly bot?: boolean;
}

interface DiscordChannel {
  readonly id: string;
  readonly name?: string;
  readonly guild_id?: string;
}

interface DiscordGuild {
  readonly id: string;
  readonly name: string;
}
```

## Testing Strategy

Following the TDD approach used in `ingestion-plane`:

- **normalizer.test.ts**: Test message normalization, bot filtering, missing fields, thread messages
- **identity-extractor.test.ts**: Test identity extraction from messages, bot skipping
- **scope-extractor.test.ts**: Test server + channel scope extraction
- **api-client.test.ts**: Test REST API client with mocked HTTP responses
- **gateway.test.ts**: Test Gateway lifecycle, reconnection, message filtering

All tests use Effect's `Effect.runPromise` / `Effect.either` patterns with mock data.

## Dependencies

- `@timesheet-ai/domain` — types (`NormalizedEvent`, `Source`)
- `@timesheet-ai/ingestion-core` — `IngestionPlugin` interface, pipeline
- `@timesheet-ai/shared` — shared utilities
- `effect` — Effect-TS core
- No external Discord library — raw WebSocket + REST (lightweight, no dependency bloat)
