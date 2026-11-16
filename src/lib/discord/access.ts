import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users } from "@/db/schema";
import { getDiscordVoiceChannel } from "./api";
import { assertDiscordGuild } from "./config";

export async function discordIdentity(userId: string) {
  const [user] = await getDb().select({ discordId: sql<string | null>`coalesce(${accounts.providerAccountId}, ${users.discordId})`,
    status: users.accountStatus }).from(users)
    .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "ACTIVE") throw new Error("ACCOUNT_DISABLED");
  if (!user.discordId) throw new Error("DISCORD_IDENTITY");
  return user.discordId;
}

export async function assertCallEntry(room: { discordGuildId: string | null; discordChannelId: string | null }, userId: string) {
  if (!room.discordGuildId) return;
  assertDiscordGuild(room.discordGuildId);
  const channel = await getDiscordVoiceChannel(await discordIdentity(userId));
  if (!channel || channel !== room.discordChannelId) throw new Error("DISCORD_CALL_REQUIRED");
}
