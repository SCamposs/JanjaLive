import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { joinRequests, roomMembers, rooms, users, type Room } from "@/db/schema";
import { createInviteToken, createRoomCode, hashInviteToken } from "./crypto";
import { canAutoJoinInvite, canManageRoom, isAuthorizedMember, isRoomActive } from "./room-policy";
import { assertCanTargetMember, getMembershipTransition } from "./membership";
import { hasActiveRoomPresence } from "./realtime";
import { assertRoomCreationEnabled, RESOURCE_LIMITS } from "./operational-policy";

export const ROOM_INACTIVITY_MS = 3 * 24 * 60 * 60 * 1_000;
export const ROOM_PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1_000;

export type RoomSnapshot = {
  room: {
    id: string;
    name: string;
    publicId: string;
    code: string;
    accessMode: "APPROVAL" | "INVITE";
    isOwner: boolean;
  };
  access: "authorized" | "invited" | "pending" | "rejected";
  members: Array<{
    userId: string;
    name: string;
    image: string | null;
    role: "OWNER" | "MEMBER";
  }>;
  pending: Array<{ userId: string; name: string; image: string | null }>;
};

export async function createRoom(input: {
  userId: string;
  name?: string;
  accessMode: "APPROVAL" | "INVITE";
}) {
  assertRoomCreationEnabled();
  const db = getDb();
  const id = randomUUID();
  const inviteToken = createInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_INACTIVITY_MS);

  // Neon batch is a transaction. Lock first, then count in the next statement:
  // concurrent creates by this owner cannot both consume the final slot.
  const [, inserted] = await db.batch([
    db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update"),
    db.execute(sql`insert into rooms (id, owner_id, public_id, code, invite_hash, name, access_mode, last_active_at, expires_at)
      select ${id}::uuid, ${input.userId}, ${nanoid(18)}, ${createRoomCode()}, ${hashInviteToken(inviteToken)},
        ${input.name ?? null}, ${input.accessMode}::access_mode, ${now}, ${expiresAt}
      where exists (select 1 from users where id = ${input.userId} and account_status = 'ACTIVE')
        and (select count(*) from rooms where owner_id = ${input.userId} and closed_at is null and expires_at > ${now}) < ${RESOURCE_LIMITS.activeRoomsPerOwner}
        and exists (select 1 from users where id = ${input.userId} and
          (room_creation_window_at <= ${new Date(now.getTime() - 86_400_000)} or room_creation_count < ${RESOURCE_LIMITS.roomCreationsPerDay}))
      returning id`),
    db.execute(sql`update users set
      room_creation_count = case when room_creation_window_at <= ${new Date(now.getTime() - 86_400_000)} then 1 else room_creation_count + 1 end,
      room_creation_window_at = case when room_creation_window_at <= ${new Date(now.getTime() - 86_400_000)} then ${now} else room_creation_window_at end
      where id = ${input.userId} and exists (select 1 from rooms where id = ${id}::uuid)`),
    db.execute(sql`insert into room_members (room_id, user_id, role)
      select id, ${input.userId}, 'OWNER' from rooms where id = ${id}::uuid`),
  ]);
  if (!inserted.rows.length) throw new Error("ROOM_LIMIT_REACHED");

  return { id, inviteToken };
}

export type AvailableRoom = {
  id: string;
  publicId: string;
  name: string;
  role: "OWNER" | "MEMBER";
  expiresAt: Date;
  expiresInMs: number;
};

export async function listAvailableRooms(userId: string): Promise<AvailableRoom[]> {
  const now = new Date();
  const rows = await getDb()
    .select({
      id: rooms.id,
      publicId: rooms.publicId,
      name: rooms.name,
      role: roomMembers.role,
      expiresAt: rooms.expiresAt,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(and(
      eq(roomMembers.userId, userId),
      isNull(roomMembers.revokedAt),
      isNull(rooms.closedAt),
      gt(rooms.expiresAt, now),
    ))
    .orderBy(desc(rooms.lastActiveAt));

  const renderedAt = Date.now();
  return rows.map((room) => ({
    ...room,
    name: room.name || "Sala",
    expiresInMs: Math.max(0, room.expiresAt.getTime() - renderedAt),
  }));
}

export async function refreshRoomActivity(roomId: string) {
  const now = new Date();
  await getDb()
    .update(rooms)
    .set({ lastActiveAt: now, expiresAt: new Date(now.getTime() + ROOM_INACTIVITY_MS) })
    .where(and(eq(rooms.id, roomId), isNull(rooms.closedAt), gt(rooms.expiresAt, now)));
}

export async function purgeStaleRooms(now = new Date()) {
  const cutoff = new Date(now.getTime() - ROOM_PURGE_DELAY_MS);
  const candidates = await getDb()
    .select({ id: rooms.id })
    .from(rooms)
    .where(or(lt(rooms.expiresAt, cutoff), lt(rooms.closedAt, cutoff)))
    .limit(100);

  if (!candidates.length) return 0;

  // Presence is provider-owned. If it cannot be checked, cleanup fails closed
  // and no room is removed.
  const presence = await Promise.all(
    candidates.map(async ({ id }) => ({ id, active: await hasActiveRoomPresence(id, now.getTime()) })),
  );
  const removableIds = presence.filter(({ active }) => !active).map(({ id }) => id);
  if (!removableIds.length) return 0;

  const removed = await getDb().delete(rooms).where(inArray(rooms.id, removableIds)).returning({ id: rooms.id });
  return removed.length;
}

async function getMember(roomId: string, userId: string) {
  const [member] = await getDb()
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return member;
}

export async function assertAuthorizedRoom(roomId: string, userId: string) {
  const db = getDb();
  const [result] = await db
    .select({ room: rooms, member: roomMembers })
    .from(rooms)
    .leftJoin(roomMembers, and(eq(roomMembers.roomId, rooms.id), eq(roomMembers.userId, userId)))
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!result?.room || !isRoomActive(result.room)) throw new Error("ROOM_UNAVAILABLE");
  if (!isAuthorizedMember(result.member)) throw new Error("ROOM_FORBIDDEN");
  return { room: result.room, member: result.member! };
}

export async function getRoomSnapshot(inviteToken: string, userId: string): Promise<RoomSnapshot | null> {
  const db = getDb();
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.inviteHash, hashInviteToken(inviteToken)))
    .limit(1);

  if (!room || !isRoomActive(room)) return null;

  return buildRoomSnapshot(room, userId, true);
}

export async function getRoomSnapshotByPublicId(publicId: string, userId: string): Promise<RoomSnapshot | null> {
  const [room] = await getDb().select().from(rooms).where(eq(rooms.publicId, publicId)).limit(1);
  if (!room || !isRoomActive(room)) return null;
  return buildRoomSnapshot(room, userId, false);
}

export async function getAuthorizedRoomSnapshot(roomId: string, userId: string): Promise<RoomSnapshot> {
  const { room } = await assertAuthorizedRoom(roomId, userId);
  return buildRoomSnapshot(room, userId, false);
}

export async function resolveRoomCode(code: string): Promise<string | null> {
  const [room] = await getDb().select().from(rooms).where(eq(rooms.code, code)).limit(1);
  return room && isRoomActive(room) ? room.publicId : null;
}

async function buildRoomSnapshot(room: Room, userId: string, allowInviteAutoJoin: boolean): Promise<RoomSnapshot> {
  const db = getDb();

  let member = await getMember(room.id, userId);
  if (canAutoJoinInvite(member, room.accessMode, allowInviteAutoJoin)) {
    await activateRoomMember(room.id, userId, false);
    member = await getMember(room.id, userId);
  }

  const [request] = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.roomId, room.id), eq(joinRequests.userId, userId)))
    .limit(1);

  const access = isAuthorizedMember(member)
    ? "authorized"
    : request?.status === "PENDING"
      ? "pending"
      : request?.status === "REJECTED"
        ? "rejected"
        : "invited";

  if (access === "authorized") await refreshRoomActivity(room.id);

  const memberRows = isAuthorizedMember(member)
    ? await db
        .select({
          userId: roomMembers.userId,
          role: roomMembers.role,
          name: users.displayName,
          fallbackName: users.name,
          image: users.avatar,
          fallbackImage: users.image,
        })
        .from(roomMembers)
        .innerJoin(users, eq(roomMembers.userId, users.id))
        .where(and(eq(roomMembers.roomId, room.id), isNull(roomMembers.revokedAt)))
    : [];

  const pendingRows = canManageRoom(member)
    ? await db
        .select({
          userId: joinRequests.userId,
          name: users.displayName,
          fallbackName: users.name,
          image: users.avatar,
          fallbackImage: users.image,
        })
        .from(joinRequests)
        .innerJoin(users, eq(joinRequests.userId, users.id))
        .where(and(eq(joinRequests.roomId, room.id), eq(joinRequests.status, "PENDING")))
    : [];

  return {
    room: {
      id: room.id,
      name: room.name || "Sala",
      publicId: room.publicId,
      code: room.code,
      accessMode: room.accessMode,
      isOwner: member?.role === "OWNER" && member.revokedAt === null,
    },
    access,
    members: memberRows.map((row) => ({
      userId: row.userId,
      role: row.role,
      name: row.name || row.fallbackName || "Membro",
      image: row.image || row.fallbackImage,
    })),
    pending: pendingRows.map((row) => ({
      userId: row.userId,
      name: row.name || row.fallbackName || "Membro",
      image: row.image || row.fallbackImage,
    })),
  };
}

export async function requestRoomAccess(roomId: string, userId: string) {
  const db = getDb();
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room || !isRoomActive(room)) throw new Error("ROOM_UNAVAILABLE");
  const member = await getMember(room.id, userId);
  if (isAuthorizedMember(member)) return;

  await db
    .insert(joinRequests)
    .values({ roomId, userId })
    .onConflictDoUpdate({
      target: [joinRequests.roomId, joinRequests.userId],
      set: { status: "PENDING", requestedAt: new Date(), resolvedAt: null, resolvedBy: null },
    });
}

export async function manageRoomMember(input: {
  roomId: string;
  ownerId: string;
  userId: string;
  action: "approve" | "reject" | "revoke";
}) {
  const db = getDb();
  const { member: owner } = await assertAuthorizedRoom(input.roomId, input.ownerId);
  if (!canManageRoom(owner)) throw new Error("OWNER_REQUIRED");
  assertCanTargetMember(input.ownerId, input.userId);
  const transition = getMembershipTransition(input.action);
  const changedAt = new Date();

  if (transition.membership === "active") {
    const [target] = await db.select({ accountStatus: users.accountStatus })
      .from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.accountStatus !== "ACTIVE") throw new Error("ACCOUNT_DISABLED");
    await activateRoomMember(input.roomId, input.userId, true);
    await db
        .update(joinRequests)
        .set({ status: "APPROVED", resolvedAt: changedAt, resolvedBy: input.ownerId })
        .where(and(eq(joinRequests.roomId, input.roomId), eq(joinRequests.userId, input.userId)));
    return changedAt.getTime();
  }

  if (transition.request === "REJECTED") {
    await db
      .update(joinRequests)
      .set({ status: "REJECTED", resolvedAt: changedAt, resolvedBy: input.ownerId })
      .where(and(eq(joinRequests.roomId, input.roomId), eq(joinRequests.userId, input.userId)));
    return changedAt.getTime();
  }

  await db
    .update(roomMembers)
    .set({ revokedAt: changedAt })
    .where(and(eq(roomMembers.roomId, input.roomId), eq(roomMembers.userId, input.userId)));
  return changedAt.getTime();
}

export async function activateRoomMember(roomId: string, userId: string, restore: boolean) {
  const db = getDb();
  const now = new Date();
  const conflict = restore
    ? sql`on conflict (room_id, user_id) do update set revoked_at = null, approved_at = excluded.approved_at`
    : sql`on conflict (room_id, user_id) do update set approved_at = room_members.approved_at where room_members.revoked_at is null`;
  const [, , inserted] = await db.batch([
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update"),
    db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update"),
    db.execute(sql`insert into room_members (room_id, user_id, role, approved_at)
      select ${roomId}::uuid, ${userId}, 'MEMBER', ${now}
      where exists (select 1 from rooms where id = ${roomId}::uuid and closed_at is null and expires_at > ${now})
        and exists (select 1 from users where id = ${userId} and account_status = 'ACTIVE')
        and ((select count(*) from room_members where room_id = ${roomId}::uuid and revoked_at is null) < ${RESOURCE_LIMITS.membersPerRoom}
          or exists (select 1 from room_members where room_id = ${roomId}::uuid and user_id = ${userId} and revoked_at is null))
      ${conflict} returning id`),
  ]);
  if (!inserted.rows.length) throw new Error("ROOM_MEMBER_LIMIT_REACHED");
}

export async function regenerateRoomInvite(roomId: string, ownerId: string) {
  const db = getDb();
  const { member, room } = await assertAuthorizedRoom(roomId, ownerId);
  if (!canManageRoom(member)) throw new Error("OWNER_REQUIRED");
  const inviteToken = createInviteToken();
  await db
    .update(rooms)
    .set({ inviteHash: hashInviteToken(inviteToken), inviteVersion: room.inviteVersion + 1 })
    .where(eq(rooms.id, roomId));
  return inviteToken;
}

export async function closeRoom(roomId: string, ownerId: string) {
  const db = getDb();
  const [room] = await db.select({ ownerId: rooms.ownerId, closedAt: rooms.closedAt })
    .from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new Error("ROOM_UNAVAILABLE");
  if (room.ownerId !== ownerId) throw new Error("OWNER_REQUIRED");
  if (room.closedAt) return;
  await db.update(rooms).set({ closedAt: new Date() }).where(and(eq(rooms.id, roomId), isNull(rooms.closedAt)));
}

export async function deleteRoom(roomId: string, ownerId: string) {
  const { member } = await assertAuthorizedRoom(roomId, ownerId);
  if (!canManageRoom(member)) throw new Error("OWNER_REQUIRED");
  await getDb().delete(rooms).where(eq(rooms.id, roomId));
}
