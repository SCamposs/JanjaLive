import { timingSafeEqual } from "node:crypto";
import { purgeStaleRooms } from "@/lib/rooms";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const received = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const removed = await purgeStaleRooms();
  return Response.json({ removed });
}
