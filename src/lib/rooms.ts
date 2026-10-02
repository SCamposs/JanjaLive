import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { joinRequests, roomMembers, rooms, users, type Room } from "@/db/schema";
import { createInviteToken, createRoomCode, hashInviteToken } from "./crypto";
import { canAutoJoinInvite, canManageRoom, isAuthorizedMember, isRoomActive } from "./room-policy";
import { assertCanTargetMember, getMembershipTransition } from "./membership";

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
  expiresInHours?: number;
}) {
  const db = getDb();
  const id = randomUUID();
  const inviteToken = createInviteToken();
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1_000)
    : null;

  await db.batch([
    db.insert(rooms).values({
      id,
      ownerId: input.userId,
      publicId: nanoid(18),
      code: createRoomCode(),
      inviteHash: hashInviteToken(inviteToken),
      name: input.name,
      accessMode: input.accessMode,
      expiresAt,
    }),
    db.insert(roomMembers).values({ roomId: id, userId: input.userId, role: "OWNER" }),
  ]);

  return { id, inviteToken };
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
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room || !isRoomActive(room)) throw new Error("ROOM_UNAVAILABLE");
  const member = await getMember(room.id, userId);
  if (!isAuthorizedMember(member)) throw new Error("ROOM_FORBIDDEN");
  return { room, member: member! };
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

export async function resolveRoomCode(code: string): Promise<string | null> {
  const [room] = await getDb().select().from(rooms).where(eq(rooms.code, code)).limit(1);
  return room && isRoomActive(room) ? room.publicId : null;
}

async function buildRoomSnapshot(room: Room, userId: string, allowInviteAutoJoin: boolean): Promise<RoomSnapshot> {
  const db = getDb();

  let member = await getMember(room.id, userId);
  if (canAutoJoinInvite(member, room.accessMode, allowInviteAutoJoin)) {
    await db
      .insert(roomMembers)
      .values({ roomId: room.id, userId, role: "MEMBER" })
      .onConflictDoNothing();
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
      name: room.name || "Sala de amigos",
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

  if (transition.membership === "active") {
    await db.batch([
      db
        .insert(roomMembers)
        .values({ roomId: input.roomId, userId: input.userId, role: "MEMBER" })
        .onConflictDoUpdate({
          target: [roomMembers.roomId, roomMembers.userId],
          set: { revokedAt: null, approvedAt: new Date(), role: "MEMBER" },
        }),
      db
        .update(joinRequests)
        .set({ status: "APPROVED", resolvedAt: new Date(), resolvedBy: input.ownerId })
        .where(and(eq(joinRequests.roomId, input.roomId), eq(joinRequests.userId, input.userId))),
    ]);
    return;
  }

  if (transition.request === "REJECTED") {
    await db
      .update(joinRequests)
      .set({ status: "REJECTED", resolvedAt: new Date(), resolvedBy: input.ownerId })
      .where(and(eq(joinRequests.roomId, input.roomId), eq(joinRequests.userId, input.userId)));
    return;
  }

  await db
    .update(roomMembers)
    .set({ revokedAt: new Date() })
    .where(and(eq(roomMembers.roomId, input.roomId), eq(roomMembers.userId, input.userId)));
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
  const { member } = await assertAuthorizedRoom(roomId, ownerId);
  if (!canManageRoom(member)) throw new Error("OWNER_REQUIRED");
  await getDb().update(rooms).set({ closedAt: new Date() }).where(eq(rooms.id, roomId));
}
