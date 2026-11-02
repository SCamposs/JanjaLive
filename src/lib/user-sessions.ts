import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { desktopAuthGrants, desktopSessions, roomMembers, rooms, sessions, users } from "@/db/schema";
import { setRealtimeAccountAccess } from "./realtime";
import { revokeUserTurnCredentials } from "./turn";

export async function revokeAllUserSessions(userId: string) {
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.update(users).set({ sessionsRevokedAt: now, sessionDisconnectPending: true }).where(eq(users.id, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.delete(desktopAuthGrants).where(eq(desktopAuthGrants.userId, userId)),
    db.update(desktopSessions).set({ revokedAt: now }).where(and(eq(desktopSessions.userId, userId), isNull(desktopSessions.revokedAt))),
  ]);
  await disconnectUserSessions(userId, now);
}

export async function disconnectUserSessions(userId: string, changedAt: Date) {
  const memberships = await getDb().select({ roomId: roomMembers.roomId }).from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(roomMembers.userId, userId), isNull(rooms.closedAt)));
  const results = await Promise.allSettled([
    revokeUserTurnCredentials(userId, changedAt),
    ...memberships.map(({ roomId }) => setRealtimeAccountAccess({
      roomId, senderUserId: userId, targetUserId: userId, action: "BAN", changedAt: changedAt.getTime(),
    })),
  ]);
  if (results.some((result) => result.status === "rejected")) throw new Error("ACCESS_REVOCATION_INCOMPLETE");
  await getDb().update(users).set({ sessionDisconnectPending: false })
    .where(and(eq(users.id, userId), eq(users.sessionsRevokedAt, changedAt)));
}

export async function retrySessionDisconnects() {
  const pending = await getDb().select({ id: users.id, cutoff: users.sessionsRevokedAt }).from(users)
    .where(eq(users.sessionDisconnectPending, true)).limit(20);
  const results = await Promise.allSettled(pending.map(({ id, cutoff }) => {
    if (!cutoff) throw new Error("INVALID_REVOCATION_CUTOFF");
    return disconnectUserSessions(id, cutoff);
  }));
  return { retried: results.length, pending: results.filter((result) => result.status === "rejected").length };
}
