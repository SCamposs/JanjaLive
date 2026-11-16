import { createPublicKey, verify } from "node:crypto";
import { discordConfig } from "./config";

export function verifyDiscordSignature(body: Buffer, timestamp: string | null, signature: string | null, now = Date.now()) {
  if (!/^\d{10,12}$/.test(timestamp ?? "") || !/^[a-f\d]{128}$/i.test(signature ?? "")
    || Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(discordConfig().publicKey, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.concat([Buffer.from(timestamp!), body]), key, Buffer.from(signature!, "hex"));
  } catch { return false; }
}

export class DiscordApiError extends Error {
  constructor(public status: number, public code?: number) {
    super(status === 403 ? "DISCORD_PERMISSION" : status === 429 ? "RATE_LIMITED" : "DISCORD_UNAVAILABLE");
  }
}

export async function discordRequest<T>(path: string, options: { method?: string; body?: unknown; webhook?: boolean } = {}): Promise<T> {
  const config = discordConfig();
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method: options.method ?? "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7000),
    headers: { "Content-Type": "application/json", ...(options.webhook ? {} : { Authorization: `Bot ${config.token}` }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new DiscordApiError(response.status, result?.code);
  return result as T;
}

export async function getDiscordVoiceChannel(discordId: string): Promise<string | null> {
  const { guildId } = discordConfig();
  if (!/^\d{17,20}$/.test(discordId)) throw new Error("DISCORD_IDENTITY");
  let voice;
  try { voice = await discordRequest<{ user_id: string; channel_id: string | null }>(`/guilds/${guildId}/voice-states/${discordId}`); }
  catch (error) { if (error instanceof DiscordApiError && error.status === 404 && error.code === 10065) return null; throw error; }
  if (!voice.channel_id) return null;
  if (voice.user_id !== discordId || !/^\d{17,20}$/.test(voice.channel_id)) throw new Error("DISCORD_UNAVAILABLE");
  const channel = await discordRequest<{ id: string; guild_id: string; type: number }>(`/channels/${voice.channel_id}`);
  return channel.guild_id === guildId && channel.type === 2 ? channel.id : null;
}
