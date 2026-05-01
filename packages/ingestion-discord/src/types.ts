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
