import { and, asc, countDistinct, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, adminAuditLog, desktopSessions, roomMembers, rooms, sessions, users } from "@/db/schema";
import { setRealtimeAccountAccess } from "./realtime";
import { assertAdminTarget, getConfiguredOwner } from "./admin-policy";

export type AuthenticatedUser = { id: string; name: string; image: string | null };

export async function getActiveUserById(userId: string): Promise<AuthenticatedUser> {
  const [user] = await getDb().select({
    id: users.id,
    displayName: users.displayName,
    fallbackName: users.name,
    avatar: users.avatar,
    fallbackImage: users.image,
    accountStatus: users.accountStatus,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.accountStatus !== "ACTIVE") throw new Error("ACCOUNT_DISABLED");
  return {
    id: user.id,
    name: user.displayName || user.fallbackName || "Conta Discord",
    image: user.avatar || user.fallbackImage,
  };
}

export type AdminUserOrder = "newest" | "oldest";

export type AdminUserListOptions = {
  search?: string;
  order?: AdminUserOrder;
  page?: number;
  pageSize?: number;
};

export async function listAdminUsers(options: AdminUserListOptions = {}) {
  const normalized = (options.search ?? "").trim().slice(0, 128);
  const order: AdminUserOrder = options.order === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 25)));
  const condition = normalized
    ? or(
        ilike(users.displayName, `%${normalized}%`),
        ilike(users.username, `%${normalized}%`),
        ilike(users.id, `%${normalized}%`),
        ilike(users.discordId, `%${normalized}%`),
        ilike(accounts.providerAccountId, `%${normalized}%`),
      )
    : undefined;
  const db = getDb();
  const [{ total }] = await db.select({ total: countDistinct(users.id) })
    .from(users)
    .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .where(condition);
  const totalUsers = Number(total);
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const currentPage = Math.min(page, totalPages);
  const usersPage = await db.select({
    id: users.id,
    discordId: sql<string | null>`coalesce(${accounts.providerAccountId}, ${users.discordId})`,
    username: users.username,
    displayName: users.displayName,
    name: users.name,
    avatar: users.avatar,
    image: users.image,
    accountStatus: users.accountStatus,
    createdAt: users.createdAt,
    accessChangedAt: users.accessChangedAt,
  }).from(users)
    .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .where(condition)
    .orderBy(order === "oldest" ? asc(users.createdAt) : desc(users.createdAt), asc(users.id))
    .limit(pageSize)
    .offset((currentPage - 1) * pageSize);
  return {
    users: usersPage,
    page: currentPage,
    pageSize,
    total: totalUsers,
    totalPages,
    order,
  };
}

export async function setUserAccess(input: {
  actorUserId: string;
  targetUserId: string;
  action: "BAN" | "UNBAN";
  reason?: string;
}) {
  const owner = getConfiguredOwner();
  assertAdminTarget(input.actorUserId, input.targetUserId, owner.userId);
  const db = getDb();
  const [target] = await db.select({ id: users.id, accountStatus: users.accountStatus })
    .from(users).where(eq(users.id, input.targetUserId)).limit(1);
  if (!target) throw new Error("USER_NOT_FOUND");
  const nextStatus = input.action === "BAN" ? "BANNED" : "ACTIVE";
  const changed = target.accountStatus !== nextStatus;
  const now = new Date();
  if (changed) {
    await db.batch([
      db.update(users).set({ accountStatus: nextStatus, accessChangedAt: now, updatedAt: now })
        .where(eq(users.id, target.id)),
      db.insert(adminAuditLog).values({
        action: input.action,
        targetUserId: target.id,
        actorUserId: input.actorUserId,
        reason: input.reason?.trim().slice(0, 240) || null,
        createdAt: now,
      }),
    ]);
  }
  if (input.action === "BAN") {
    await Promise.all([
      db.delete(sessions).where(eq(sessions.userId, target.id)),
      db.update(desktopSessions).set({ revokedAt: now })
        .where(and(eq(desktopSessions.userId, target.id), isNull(desktopSessions.revokedAt))),
    ]);
  }
  const memberships = await db.select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(and(eq(roomMembers.userId, target.id), isNull(rooms.closedAt)));
  await Promise.all(memberships.map(({ roomId }) => setRealtimeAccountAccess({
    roomId,
    senderUserId: input.actorUserId,
    targetUserId: target.id,
    action: input.action,
    changedAt: now.getTime(),
  })));
  return { changed };
}
