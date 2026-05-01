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
