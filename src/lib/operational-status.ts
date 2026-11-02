import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Called only on owner page navigation. No timers or per-request telemetry.
export async function getOperationalStatus() {
  const result = await getDb().execute(sql`select
    (select count(*)::int from rooms where closed_at is null and expires_at > now()) as "activeRooms",
    (select count(*)::int from users where account_status = 'BANNED') as "bannedUsers",
    (select count(*)::int from users where session_disconnect_pending) as "pendingDisconnects",
    (select count(*)::int from turn_credentials where expires_at > now()) as "activeTurnCredentials"`);
  return result.rows[0] as { activeRooms: number; bannedUsers: number; pendingDisconnects: number; activeTurnCredentials: number };
}
