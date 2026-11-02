import { and, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { turnCredentials, users } from "@/db/schema";

export const TURN_CREDENTIAL_TTL_SECONDS = 3_600;
const turnResponseSchema = z.object({
  iceServers: z.array(z.object({
    urls: z.union([z.string(), z.array(z.string())]),
    username: z.string().max(512).optional(),
    credential: z.string().optional(),
  })),
});

export async function generateTurnCredentials(userId: string): Promise<RTCIceServer[] | null> {
  const requestedAt = new Date();
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) return null;
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    { method: "POST", headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }), cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const parsed = turnResponseSchema.parse(await response.json());
  const usernames = [...new Set(parsed.iceServers.flatMap((server) => server.username ? [server.username] : []))];
  if (!usernames.length) return null;
  try {
    const db = getDb();
    const [, tracked] = await db.batch([
      db.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update"),
      db.execute(sql`insert into turn_credentials (username, key_id, user_id, issued_at, expires_at)
      select value, ${keyId}, ${userId}, ${requestedAt}, ${new Date(Date.now() + TURN_CREDENTIAL_TTL_SECONDS * 1_000)}
      from jsonb_array_elements_text(${JSON.stringify(usernames)}::jsonb)
      where exists (select 1 from users where id = ${userId} and account_status = 'ACTIVE'
        and (sessions_revoked_at is null or sessions_revoked_at < ${requestedAt}))
      on conflict do nothing returning username`),
    ]);
    if (tracked.rows.length !== usernames.length) throw new Error("TURN_UNAVAILABLE");
  } catch {
    // Never hand out credentials we cannot later revoke.
    await Promise.all(usernames.map((username) => revokeTurnCredential(keyId, username)));
    throw new Error("TURN_UNAVAILABLE");
  }
  return parsed.iceServers;
}

async function revokeTurnCredential(keyId: string, username: string) {
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!apiToken) throw new Error("TURN_REVOCATION_FAILED");
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/${encodeURIComponent(username)}/revoke`,
    { method: "POST", headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok && response.status !== 404) throw new Error("TURN_REVOCATION_FAILED");
}

export async function revokeUserTurnCredentials(userId: string, issuedBefore?: Date) {
  const db = getDb();
  const credentials = await db.select().from(turnCredentials)
    .where(and(eq(turnCredentials.userId, userId), gt(turnCredentials.expiresAt, new Date()),
      issuedBefore ? lte(turnCredentials.issuedAt, issuedBefore) : undefined));
  // All revocations are attempted. Failed records remain available for retry.
  const results = await Promise.allSettled(credentials.map(async ({ keyId, username }) => {
    await revokeTurnCredential(keyId, username);
    return username;
  }));
  const revoked = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (revoked.length) await db.delete(turnCredentials).where(inArray(turnCredentials.username, revoked));
  if (results.some((result) => result.status === "rejected")) throw new Error("TURN_REVOCATION_FAILED");
}

export async function purgeTurnCredentials() {
  const banned = await getDb().selectDistinct({ userId: turnCredentials.userId }).from(turnCredentials)
    .innerJoin(users, eq(users.id, turnCredentials.userId))
    .where(and(eq(users.accountStatus, "BANNED"), gt(turnCredentials.expiresAt, new Date()))).limit(20);
  const results = await Promise.allSettled(banned.map(({ userId }) => revokeUserTurnCredentials(userId)));
  await getDb().delete(turnCredentials).where(lt(turnCredentials.expiresAt, new Date()));
  return { retried: results.length, pending: results.filter((result) => result.status === "rejected").length };
}
