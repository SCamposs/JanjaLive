import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/realtime";
import { assertAuthorizedRoom } from "@/lib/rooms";
import { generateTurnCredentials, revokeUserTurnCredentials } from "@/lib/turn";
import { getActiveUserById } from "@/lib/account-access";
import { isTurnEnabled, RESOURCE_LIMITS } from "@/lib/operational-policy";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }];

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const roomId = z.string().uuid().parse(new URL(request.url).searchParams.get("roomId"));
    await assertAuthorizedRoom(roomId, user.id);
    const fallback = () => Response.json({ iceServers: DEFAULT_ICE_SERVERS, hasTurn: false }, { headers: { "Cache-Control": "no-store" } });
    if (!isTurnEnabled()) return fallback();
    await enforceRateLimit(`turn:${user.id}`, RESOURCE_LIMITS.turnRequestsPerHour, 3_600);
    const iceServers = await generateTurnCredentials(user.id);
    if (!iceServers) return fallback();
    // A ban may have happened while the provider request was in flight.
    try { await getActiveUserById(user.id); } catch (error) {
      await revokeUserTurnCredentials(user.id);
      throw error;
    }
    return Response.json({ iceServers, hasTurn: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
