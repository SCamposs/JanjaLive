import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { discordCallIntents, rooms, type Room } from "@/db/schema";
import { createRoom } from "@/lib/rooms";
import { createShareableInvite } from "@/lib/shareable-invite";
import { enforceRateLimit } from "@/lib/realtime";
import { assertCallEntry, discordIdentity } from "./access";
import { DiscordApiError, discordRequest, getDiscordVoiceChannel } from "./api";
import { assertDiscordGuild, discordConfig } from "./config";

export async function createCallIntent(interactionId: string, discordUserId: string) {
  const config = discordConfig();
  await enforceRateLimit(`discord:command:${discordUserId}`, 5, 60);
  await enforceRateLimit(`discord:guild:${config.guildId}`, 30, 600);
  const channelId = await getDiscordVoiceChannel(discordUserId);
  if (!channelId) throw new Error("DISCORD_CALL_REQUIRED");
  const db = getDb();
  await db.delete(discordCallIntents).where(lte(discordCallIntents.expiresAt, new Date()));
  const [intent] = await db.insert(discordCallIntents).values({ id: nanoid(32), interactionId,
    discordUserId, guildId: config.guildId, channelId, expiresAt: new Date(Date.now() + 15 * 60_000) })
    .onConflictDoUpdate({ target: discordCallIntents.interactionId, set: { interactionId } }).returning();
  return intent;
}

export async function getCallIntent(id: string, userId: string) {
  discordConfig();
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) throw new Error("DISCORD_EXPIRED");
  const [intent] = await getDb().select().from(discordCallIntents)
    .where(and(eq(discordCallIntents.id, id), gt(discordCallIntents.expiresAt, new Date()))).limit(1);
  if (!intent) throw new Error("DISCORD_EXPIRED");
  assertDiscordGuild(intent.guildId);
  if (await discordIdentity(userId) !== intent.discordUserId) throw new Error("DISCORD_IDENTITY");
  return intent;
}

export function callCard(room: Pick<Room, "publicId">, ended = false) {
  const { origin } = discordConfig();
  return { allowed_mentions: { parse: [] }, embeds: [{ title: ended ? "Sessão encerrada" : "Sala da call",
    description: ended ? "Use /janja para abrir uma nova sessão." : "Entre no JanjaLive para assistir ou compartilhar sua tela.", color: 0x961b30 }],
    components: ended ? [] : [{ type: 1, components: [{ type: 2, style: 5, label: "Entrar", url: `${origin}/call/${room.publicId}` }] }] };
}

export async function publishCallCard(room: Room) {
  if (!room.discordChannelId) return false;
  if (room.discordMessageId) return true;
  const db = getDb();
  const [claimed] = await db.update(rooms).set({ discordCardClaimedAt: new Date() })
    .where(and(eq(rooms.id, room.id), isNull(rooms.discordMessageId), isNull(rooms.discordCardClaimedAt), isNull(rooms.closedAt)))
    .returning({ id: rooms.id });
  if (!claimed) return false;
  try {
    const message = await discordRequest<{ id: string }>(`/channels/${room.discordChannelId}/messages`, {
      method: "POST", body: { ...callCard(room), nonce: room.publicId, enforce_nonce: true },
    });
    if (!/^\d{17,20}$/.test(message.id)) throw new Error("DISCORD_UNAVAILABLE");
    await db.update(rooms).set({ discordMessageId: message.id }).where(eq(rooms.id, room.id));
    return true;
  } catch (error) {
    // A definitive HTTP rejection can be retried. A timeout is ambiguous: keep
    // the claim to avoid publishing duplicates after the Discord nonce window.
    if (error instanceof DiscordApiError) {
      await db.update(rooms).set({ discordCardClaimedAt: null }).where(eq(rooms.id, room.id));
    }
    throw error;
  }
}

export async function startCall(id: string, userId: string) {
  const intent = await getCallIntent(id, userId);
  await enforceRateLimit(`discord:start:${userId}`, 5, 60);
  const db = getDb();
  let room: Room | undefined;
  if (intent.roomId) {
    [room] = await db.select().from(rooms).where(eq(rooms.id, intent.roomId)).limit(1);
    if (!room || room.closedAt || room.expiresAt <= new Date()) throw new Error("DISCORD_EXPIRED");
    await assertCallEntry(room, userId);
  } else {
    const created = await createRoom({ userId, name: "Sala da call", accessMode: "APPROVAL",
      discordCall: { guildId: intent.guildId, channelId: intent.channelId } });
    [room] = await db.select().from(rooms).where(eq(rooms.id, created.id)).limit(1);
    if (!room) throw new Error("DISCORD_UNAVAILABLE");
    await db.update(discordCallIntents).set({ roomId: room.id }).where(eq(discordCallIntents.id, id));
  }
  // Card failure must not turn room creation into a duplicate-creation retry.
  let cardPublished = Boolean(room.discordMessageId);
  try { cardPublished = await publishCallCard(room); }
  catch { /* The room remains available; the UI offers explicit retry. */ }
  return { room, cardPublished };
}

export function desktopCallLink(room: Room) {
  return `janjalive://room/${createShareableInvite(room)}`;
}

export async function closeCallCard(room: Room) {
  if (!room.discordMessageId || !room.discordChannelId) return;
  await discordRequest(`/channels/${room.discordChannelId}/messages/${room.discordMessageId}`, {
    method: "PATCH", body: callCard(room, true),
  });
}
