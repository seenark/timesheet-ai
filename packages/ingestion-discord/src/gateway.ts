import type { IngestionError } from "@timesheet-ai/ingestion-core";
import { logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect, type Scope } from "effect";
import type {
  DiscordConfig,
  DiscordMessage,
  DiscordMessageEnvelope,
  GatewayHello,
  GatewayIdentify,
  GatewayPayload,
} from "./types";
import { GATEWAY_INTENTS, GATEWAY_OPCODES } from "./types";

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
  lastHeartbeatAck: number;
  sequence: number | null;
  sessionId: string | null;
  ws: WebSocket | null;
}

const buildIdentifyPayload = (token: string): GatewayIdentify => ({
  d: {
    // biome-ignore lint/suspicious/noBitwiseOperators: Discord intents use bitflags
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

// Note: Sequence number updates happen on the main WebSocket event thread,
// which Discord guarantees is single-threaded per connection. This makes
// the potential race condition between the message handler and heartbeat
// fiber acceptable for this use case.
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
          // Effect.runFork is intentional here - this callback fires outside the Effect
          // runtime, so we fork the Effect to handle it without blocking
          Effect.runFork(onMessage(envelope));
        }
      }
      if (payload.t === "READY") {
        const readyData = payload.d as { session_id: string };
        state.sessionId = readyData.session_id;
        // Effect.runFork is intentional here - this callback fires outside the Effect
        // runtime, so we fork the Effect to handle it without blocking
        Effect.runFork(
          logInfo("Discord Gateway connected", {
            guildId: config.guildId,
          })
        );
      }
      break;
    }
    case GATEWAY_OPCODES.RECONNECT: {
      // Effect.runFork is intentional here - this callback fires outside the Effect
      // runtime, so we fork the Effect to handle it without blocking
      Effect.runFork(
        logWarn("Discord Gateway reconnecting...", {
          guildId: config.guildId,
        })
      );
      state.sessionId = null;
      reconnectWithBackoff(config, onMessage, channelNames, state);
      break;
    }
    case GATEWAY_OPCODES.INVALID_SESSION: {
      state.sessionId = null;
      // Effect.runFork is intentional here - this callback fires outside the Effect
      // runtime, so we fork the Effect to handle it without blocking
      Effect.runFork(
        logWarn("Discord Gateway reconnecting...", {
          guildId: config.guildId,
        })
      );
      reconnectWithBackoff(config, onMessage, channelNames, state);
      break;
    }
    case GATEWAY_OPCODES.HEARTBEAT_ACK: {
      state.lastHeartbeatAck = Date.now();
      break;
    }
    default: {
      break;
    }
  }
};

const reconnectWithBackoff = (
  config: DiscordConfig,
  onMessage: (envelope: DiscordMessageEnvelope) => Effect.Effect<void>,
  channelNames: Map<string, string>,
  state: GatewayState,
  backoffMs: number = INITIAL_BACKOFF_MS
): void => {
  const actualBackoff = Math.min(backoffMs, MAX_BACKOFF_MS);
  setTimeout(() => {
    state.ws?.close();
    const ws = new WebSocket(GATEWAY_URL);
    state.ws = ws;
    ws.addEventListener("open", () => {
      const identify = buildIdentifyPayload(config.botToken);
      ws.send(JSON.stringify(identify));
    });
    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data as string) as GatewayPayload;
      handleGatewayPayload(payload, state, config, onMessage, channelNames);
    });
    ws.addEventListener("close", () => {
      reconnectWithBackoff(
        config,
        onMessage,
        channelNames,
        state,
        actualBackoff * 2
      );
    });
  }, actualBackoff);
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
      lastHeartbeatAck: Date.now(),
    };

    const ws = new WebSocket(GATEWAY_URL);
    state.ws = ws;

    const heartbeatFiber = yield* Effect.fork(
      Effect.gen(function* () {
        yield* Effect.sleep(1000);
        while (state.heartbeatIntervalMs != null) {
          const now = Date.now();
          if (now - state.lastHeartbeatAck > state.heartbeatIntervalMs * 2) {
            Effect.runFork(
              logWarn("Heartbeat ACK missed, reconnecting...", {
                guildId: config.guildId,
              })
            );
            state.ws?.close();
            break;
          }
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
          // CR-01: Use interruptible sleep so fiber can be interrupted immediately
          yield* Effect.interruptible(Effect.sleep(state.heartbeatIntervalMs));
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
      heartbeatFiber.interrupt();
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        ws.close();
      })
    );

    return ws;
  });
