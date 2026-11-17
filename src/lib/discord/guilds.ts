import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { discordGuilds } from "@/db/schema";
import { getConfiguredOwner } from "@/lib/admin-policy";
import { setRealtimeGuildAccess } from "@/lib/realtime";
import { discordRequest } from "./api";
import { assertDiscordGuild } from "./config";

/** No allowlist: a verified installation is sufficient unless explicitly blocked. */
export async function assertGuildAdmission(guildId: string) {
  assertDiscordGuild(guildId);
  const db = getDb();
  const [existing] = await db.select({ blocked: discordGuilds.blocked }).from(discordGuilds).where(eq(discordGuilds.id, guildId)).limit(1);
  if (existing?.blocked) throw new Error("DISCORD_GUILD_BLOCKED");
  // The official bot token must actually have access. Never trust a guild name
  // or installation claim supplied by a browser or a different Discord app.
  const guild = await discordRequest<{ id: string; name: string }>(`/guilds/${guildId}`);
  if (guild.id !== guildId || typeof guild.name !== "string" || !guild.name.trim()) throw new Error("DISCORD_UNAVAILABLE");
  const [current] = await db.insert(discordGuilds).values({ id: guildId, name: guild.name.trim().slice(0, 100) })
    .onConflictDoUpdate({ target: discordGuilds.id, set: { name: guild.name.trim().slice(0, 100), lastSeenAt: new Date() } })
    .returning({ blocked: discordGuilds.blocked });
  if (!current || current.blocked) throw new Error("DISCORD_GUILD_BLOCKED");
}

export async function listDiscordGuilds(search = "", page = 1) {
  const query = search.trim().slice(0, 100);
  const condition = query ? or(ilike(discordGuilds.name, `%${query}%`), ilike(discordGuilds.id, `%${query}%`)) : undefined;
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(discordGuilds).where(condition);
  const totalPages = Math.max(1, Math.ceil(Number(total) / 20));
  const currentPage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
  const guilds = await db.select({ id: discordGuilds.id, name: discordGuilds.name, blocked: discordGuilds.blocked,
    syncPending: discordGuilds.syncPending }).from(discordGuilds).where(condition)
    .orderBy(desc(discordGuilds.lastSeenAt), discordGuilds.id).limit(20).offset((currentPage - 1) * 20);
  return { guilds, page: currentPage, total: Number(total), totalPages };
}

export async function setDiscordGuildAccess(actorUserId: string, guildId: string, blocked: boolean) {
  if (actorUserId !== getConfiguredOwner().userId) throw new Error("NOT_FOUND");
  if (!/^\d{17,20}$/.test(guildId)) throw new Error("INVALID_REQUEST");
  const db = getDb();
  const [existing] = await db.select().from(discordGuilds).where(eq(discordGuilds.id, guildId)).limit(1);
  if (!existing) throw new Error("NOT_FOUND");
  let changedAt = existing.changedAt;
  if (existing.blocked !== blocked || !changedAt) {
    // Keep policy transitions strictly ordered, even within the same millisecond.
    const result = await db.batch([
      db.update(discordGuilds).set({ blocked, syncPending: true,
        changedAt: sql`greatest(${new Date()}::timestamptz, coalesce(${discordGuilds.changedAt}, 'epoch'::timestamptz) + interval '1 millisecond')` })
        .where(eq(discordGuilds.id, guildId)).returning({ changedAt: discordGuilds.changedAt }),
      db.execute(sql`insert into discord_guild_audit_log(guild_id, actor_user_id, blocked, changed_at)
        select id, ${actorUserId}, blocked, changed_at from discord_guilds where id = ${guildId}`),
    ]);
    changedAt = result[0][0]?.changedAt ?? null;
  }
  if (!changedAt) throw new Error("DISCORD_UNAVAILABLE");
  try { await setRealtimeGuildAccess(guildId, blocked, changedAt.getTime()); }
  catch { throw new Error("DISCORD_GUILD_SYNC_PENDING"); }
  await db.update(discordGuilds).set({ syncPending: false })
    .where(and(eq(discordGuilds.id, guildId), eq(discordGuilds.changedAt, changedAt), eq(discordGuilds.blocked, blocked)));
  return { blocked, syncPending: false };
}
