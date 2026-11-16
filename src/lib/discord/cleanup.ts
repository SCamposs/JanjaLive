import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rooms } from "@/db/schema";
import { enforceRateLimit } from "@/lib/realtime";
import { DiscordApiError, discordRequest } from "./api";
import { assertDiscordGuild, discordConfig } from "./config";

const snowflake = /^\d{17,20}$/;
const MANAGE_MESSAGES = BigInt(8192);
const ADMINISTRATOR = BigInt(8);
const READ_HISTORY = BigInt(65536);

export function canCleanDiscordMessages(permissions: string) {
  if (!/^\d{1,30}$/.test(permissions)) return false;
  return (BigInt(permissions) & (MANAGE_MESSAGES | ADMINISTRATOR)) !== BigInt(0);
}

export function canReadDiscordHistory(permissions: string) {
  if (!/^\d{1,30}$/.test(permissions)) return false;
  return (BigInt(permissions) & (READ_HISTORY | ADMINISTRATOR)) !== BigInt(0);
}

type Message = { id: string; author?: { id: string } };

/** Explicit, bounded cleanup; no room deletion, membership or media operations. */
export async function cleanDiscordMessages(guildId: string, channelId: string, userId: string) {
  assertDiscordGuild(guildId);
  if (!snowflake.test(channelId) || !snowflake.test(userId)) throw new Error("DISCORD_UNAVAILABLE");
  const config = discordConfig();
  await enforceRateLimit(`discord:cleanup:channel:${channelId}`, 1, 30);
  await enforceRateLimit(`discord:cleanup:user:${userId}`, 2, 60);
  const channel = await discordRequest<{ id: string; guild_id: string }>(`/channels/${channelId}`);
  if (channel.id !== channelId || channel.guild_id !== guildId) throw new Error("DISCORD_UNAVAILABLE");
  const deadline = Date.now() + 16_000;
  let deleted = 0;
  let before: string | undefined;
  let complete = false;
  try {
    for (let page = 0; page < 5 && Date.now() < deadline; page++) {
      const messages = await discordRequest<Message[]>(`/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`);
      if (!Array.isArray(messages) || messages.some(message => !snowflake.test(message.id))) throw new Error("DISCORD_UNAVAILABLE");
      for (const message of messages) {
        if (message.author?.id !== config.appId) continue;
        if (deleted >= 20 || Date.now() >= deadline) return { deleted, complete: false };
        try { await discordRequest(`/channels/${channelId}/messages/${message.id}`, { method: "DELETE" }); }
        catch (error) {
          // A concurrent/manual deletion is safe; still detach its old receipt.
          if (!(error instanceof DiscordApiError && error.status === 404 && error.code === 10008)) throw error;
        }
        deleted++;
        await getDb().update(rooms).set({ discordMessageId: null, discordCardClaimedAt: null })
          .where(and(eq(rooms.discordGuildId, guildId), eq(rooms.discordChannelId, channelId), eq(rooms.discordMessageId, message.id)));
      }
      if (messages.length < 100) { complete = true; break; }
      const cursor = messages.at(-1)!.id;
      if (cursor === before) throw new Error("DISCORD_UNAVAILABLE");
      before = cursor;
    }
  } catch (error) {
    if (!deleted) throw error;
    // Report partial progress on rate limits, permission changes or DB failure.
    return { deleted, complete: false };
  }
  return { deleted, complete };
}

export function cleanupMessage(result: { deleted: number; complete: boolean }) {
  const progress = result.deleted ? `${result.deleted} ${result.deleted === 1 ? "mensagem do JanjaLive apagada" : "mensagens do JanjaLive apagadas"} deste canal.` : "Nenhuma mensagem do JanjaLive encontrada no histórico consultado.";
  return `${progress} Salas e transmissões foram preservadas.${result.complete ? "" : " Limpeza parcial, limitada ao histórico recente. Se ainda houver mensagens do bot nesse trecho, repita /janja-limpar em 30 segundos."}`;
}
