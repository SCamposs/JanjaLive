import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { discordCallIntents, rooms, type Room } from "@/db/schema";
import { createRoom } from "@/lib/rooms";
import { createShareableInvite } from "@/lib/shareable-invite";
import { enforceRateLimit } from "@/lib/realtime";
import { assertCallEntry, discordIdentity } from "./access";
import { DiscordApiError, discordRequest, getDiscordVoiceChannel, getDiscordCallName } from "./api";
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

export type CallCardStatus = "published" | "pending" | "failed";

async function saveCardReceipt(roomId: string, messageId: string) {
  try { await getDb().update(rooms).set({ discordMessageId: messageId }).where(eq(rooms.id, roomId)); }
  catch {
    try { await getDb().update(rooms).set({ discordMessageId: messageId }).where(eq(rooms.id, roomId)); }
    catch { console.warn("Published Discord card receipt could not be saved."); }
  }
}

type CardMetadata = { id: string; author?: { id: string }; components?: Array<{ components?: Array<{ url?: string }> }> };

async function findPublishedCard(room: Room): Promise<string | null> {
  const config = discordConfig();
  const messages = await discordRequest<CardMetadata[]>(`/channels/${room.discordChannelId}/messages?limit=100`);
  if (!Array.isArray(messages)) return null;
  const expectedUrl = `${config.origin}/call/${room.publicId}`;
  // Only metadata from this bot's exact session card is considered or retained.
  return messages.find(message => message.author?.id === config.appId && /^\d{17,20}$/.test(message.id)
    && message.components?.some(row => row.components?.some(button => button.url === expectedUrl)))?.id ?? null;
}

export async function publishCallCard(room: Room, verifyPending = false): Promise<CallCardStatus> {
  if (!room.discordChannelId) return "failed";
  if (room.discordMessageId) {
    try {
      await discordRequest(`/channels/${room.discordChannelId}/messages/${room.discordMessageId}`);
      return "published";
    } catch (error) {
      if (!(error instanceof DiscordApiError && error.status === 404 && error.code === 10008)) return "pending";
      // A deleted card must not leave an active room permanently without a link.
      await getDb().update(rooms).set({ discordMessageId: null, discordCardClaimedAt: null })
        .where(and(eq(rooms.id, room.id), eq(rooms.discordMessageId, room.discordMessageId)));
    }
  }
  const db = getDb();
  const [claimed] = await db.update(rooms).set({ discordCardClaimedAt: new Date() })
    .where(and(eq(rooms.id, room.id), isNull(rooms.discordMessageId), isNull(rooms.discordCardClaimedAt), isNull(rooms.closedAt)))
    .returning({ id: rooms.id });
  if (!claimed) {
    // Another request may have published after this request read the room.
    const [current] = await db.select({ messageId: rooms.discordMessageId }).from(rooms).where(eq(rooms.id, room.id)).limit(1);
    if (current?.messageId) return "published";
    if (verifyPending) {
      try {
        const messageId = await findPublishedCard(room);
        if (messageId) { await saveCardReceipt(room.id, messageId); return "published"; }
      } catch { console.warn("Existing Discord card could not be verified."); }
    }
    return "pending";
  }
  let message: { id: string };
  try {
    message = await discordRequest<{ id: string }>(`/channels/${room.discordChannelId}/messages`, {
      method: "POST", body: { ...callCard(room), nonce: room.publicId, enforce_nonce: true },
    });
    if (!/^\d{17,20}$/.test(message.id)) throw new Error("DISCORD_UNAVAILABLE");
  } catch (error) {
    // A definitive HTTP rejection can be retried. A timeout is ambiguous: keep
    // the claim to avoid publishing duplicates after the Discord nonce window.
    if (error instanceof DiscordApiError) {
      await db.update(rooms).set({ discordCardClaimedAt: null }).where(eq(rooms.id, room.id));
      console.warn("Discord card publication rejected.", { status: error.status });
      return "failed";
    }
    console.warn("Discord card publication could not be confirmed.");
    return "pending";
  }
  // Discord has acknowledged the message. A persistence failure must not turn
  // that acknowledgement into a false 'not published' result or another POST.
  await saveCardReceipt(room.id, message.id);
  return "published";
}

export async function startCall(id: string, userId: string, verifyCard = false) {
  const intent = await getCallIntent(id, userId);
  await enforceRateLimit(`discord:start:${userId}`, 5, 60);
  const db = getDb();
  let room: Room | undefined;
  if (intent.roomId) {
    [room] = await db.select().from(rooms).where(eq(rooms.id, intent.roomId)).limit(1);
    if (!room || room.closedAt || room.expiresAt <= new Date()) throw new Error("DISCORD_EXPIRED");
    await assertCallEntry(room, userId);
  } else {
    const created = await createRoom({ userId, name: await getDiscordCallName(intent.channelId), accessMode: "APPROVAL",
      discordCall: { guildId: intent.guildId, channelId: intent.channelId } });
    [room] = await db.select().from(rooms).where(eq(rooms.id, created.id)).limit(1);
    if (!room) throw new Error("DISCORD_UNAVAILABLE");
    await db.update(discordCallIntents).set({ roomId: room.id }).where(eq(discordCallIntents.id, id));
  }
  // Card failure must not turn room creation into a duplicate-creation retry.
  let cardStatus: CallCardStatus = room.discordMessageId ? "published" : "pending";
  try { cardStatus = await publishCallCard(room, verifyCard); }
  catch { console.warn("Discord card status could not be read."); }
  return { room, cardStatus, cardPublished: cardStatus === "published" };
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
