import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { accounts, users } from "@/db/schema";
import { getConfiguredOwner, isOwnerIdentity } from "./admin-policy";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("NOT_FOUND");
  const owner = getConfiguredOwner();
  if (session.user.id !== owner.userId) throw new Error("NOT_FOUND");
  const [user] = await getDb().select({
    id: users.id,
    discordId: users.discordId,
    providerDiscordId: accounts.providerAccountId,
    accountStatus: users.accountStatus,
  }).from(users).leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .where(eq(users.id, session.user.id)).limit(1);
  if (!user || user.accountStatus !== "ACTIVE" || !isOwnerIdentity({ userId: user.id, discordId: user.providerDiscordId || user.discordId })) {
    throw new Error("NOT_FOUND");
  }
  return user;
}
