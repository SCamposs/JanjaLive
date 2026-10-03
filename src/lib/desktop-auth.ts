import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { desktopAuthGrants, desktopSessions, users } from "@/db/schema";

const AUTH_GRANT_TTL_MS = 5 * 60 * 1_000;
const DESKTOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1_000;
const BASE64URL_SECRET = /^[A-Za-z0-9_-]{43,128}$/;

export type DesktopUser = {
  id: string;
  name: string;
  image: string | null;
};

type DesktopAuthResult = { token: string; expiresAt: string; user: DesktopUser };
type DesktopAuthExchangeInput = { state: string; verifier: string; code?: string };

export function hashDesktopSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function getPkceChallenge(verifier: string) {
  if (!BASE64URL_SECRET.test(verifier)) throw new Error("INVALID_DESKTOP_AUTH");
  return hashDesktopSecret(verifier);
}

export function desktopSecretsMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createDesktopAuthGrant(input: {
  userId: string;
  state: string;
  codeChallenge: string;
}) {
  if (!BASE64URL_SECRET.test(input.state) || !BASE64URL_SECRET.test(input.codeChallenge)) {
    throw new Error("INVALID_DESKTOP_AUTH");
  }

  const code = randomBytes(32).toString("base64url");
  const now = new Date();
  await getDb().insert(desktopAuthGrants).values({
    codeHash: hashDesktopSecret(code),
    stateHash: hashDesktopSecret(input.state),
    codeChallenge: input.codeChallenge,
    userId: input.userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + AUTH_GRANT_TTL_MS),
  });
  return code;
}

export function exchangeDesktopAuthGrant(input: DesktopAuthExchangeInput & { code: string }): Promise<DesktopAuthResult>;
export function exchangeDesktopAuthGrant(input: DesktopAuthExchangeInput & { code?: undefined }): Promise<DesktopAuthResult | null>;
export async function exchangeDesktopAuthGrant(input: DesktopAuthExchangeInput): Promise<DesktopAuthResult | null> {
  if (![input.state, input.verifier].every((value) => BASE64URL_SECRET.test(value)) || (input.code !== undefined && !BASE64URL_SECRET.test(input.code))) {
    throw new Error("INVALID_DESKTOP_AUTH");
  }

  const db = getDb();
  const grantSelector = input.code
    ? eq(desktopAuthGrants.codeHash, hashDesktopSecret(input.code))
    : eq(desktopAuthGrants.stateHash, hashDesktopSecret(input.state));
  const [grant] = await db
    .select()
    .from(desktopAuthGrants)
    .where(and(
      grantSelector,
      isNull(desktopAuthGrants.usedAt),
      gt(desktopAuthGrants.expiresAt, new Date()),
    ))
    .limit(1);

  if (!grant) {
    if (!input.code) return null;
    throw new Error("INVALID_DESKTOP_AUTH");
  }
  if (!desktopSecretsMatch(grant.stateHash, hashDesktopSecret(input.state)) || !desktopSecretsMatch(grant.codeChallenge, getPkceChallenge(input.verifier))) {
    throw new Error("INVALID_DESKTOP_AUTH");
  }

  const now = new Date();
  const consumed = await db
    .update(desktopAuthGrants)
    .set({ usedAt: now })
    .where(and(eq(desktopAuthGrants.codeHash, grant.codeHash), isNull(desktopAuthGrants.usedAt)))
    .returning({ userId: desktopAuthGrants.userId });
  if (consumed.length !== 1) throw new Error("INVALID_DESKTOP_AUTH");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + DESKTOP_SESSION_TTL_MS);
  await db.insert(desktopSessions).values({
    tokenHash: hashDesktopSecret(token),
    userId: grant.userId,
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
  });

  const user = await getDesktopUserById(grant.userId);
  if (!user) throw new Error("INVALID_DESKTOP_AUTH");
  return { token, expiresAt: expiresAt.toISOString(), user };
}

export async function getDesktopUserFromToken(token: string): Promise<DesktopUser | null> {
  if (!BASE64URL_SECRET.test(token)) return null;
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: desktopSessions.id,
      lastUsedAt: desktopSessions.lastUsedAt,
      userId: users.id,
      displayName: users.displayName,
      fallbackName: users.name,
      avatar: users.avatar,
      fallbackImage: users.image,
    })
    .from(desktopSessions)
    .innerJoin(users, eq(desktopSessions.userId, users.id))
    .where(and(
      eq(desktopSessions.tokenHash, hashDesktopSecret(token)),
      isNull(desktopSessions.revokedAt),
      gt(desktopSessions.expiresAt, now),
    ))
    .limit(1);
  if (!row) return null;

  if (now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
    await db.update(desktopSessions).set({ lastUsedAt: now }).where(eq(desktopSessions.id, row.sessionId));
  }
  return {
    id: row.userId,
    name: row.displayName || row.fallbackName || "Conta Discord",
    image: row.avatar || row.fallbackImage,
  };
}

export async function revokeDesktopSession(token: string) {
  if (!BASE64URL_SECRET.test(token)) return;
  await getDb()
    .update(desktopSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(desktopSessions.tokenHash, hashDesktopSecret(token)), isNull(desktopSessions.revokedAt)));
}

export async function purgeDesktopAuthArtifacts(now = new Date()) {
  const db = getDb();
  const [grants, sessions] = await db.batch([
    db.delete(desktopAuthGrants).where(or(
      lt(desktopAuthGrants.expiresAt, now),
      isNotNull(desktopAuthGrants.usedAt),
    )).returning({ codeHash: desktopAuthGrants.codeHash }),
    db.delete(desktopSessions).where(or(
      lt(desktopSessions.expiresAt, now),
      isNotNull(desktopSessions.revokedAt),
    )).returning({ id: desktopSessions.id }),
  ]);
  return { grants: grants.length, sessions: sessions.length };
}

async function getDesktopUserById(userId: string): Promise<DesktopUser | null> {
  const [user] = await getDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      fallbackName: users.name,
      avatar: users.avatar,
      fallbackImage: users.image,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ? {
    id: user.id,
    name: user.displayName || user.fallbackName || "Conta Discord",
    image: user.avatar || user.fallbackImage,
  } : null;
}
