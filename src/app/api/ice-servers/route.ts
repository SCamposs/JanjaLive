import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/realtime";
import { assertAuthorizedRoom } from "@/lib/rooms";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }];

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const roomId = z.string().uuid().parse(new URL(request.url).searchParams.get("roomId"));
    await assertAuthorizedRoom(roomId, user.id);
    await enforceRateLimit(`turn:${roomId}:${user.id}`, 60, 3_600);
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !apiToken) return Response.json({ iceServers: DEFAULT_ICE_SERVERS, hasTurn: false });

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3_600 }),
        cache: "no-store",
      },
    );
    if (!response.ok) return Response.json({ iceServers: DEFAULT_ICE_SERVERS, hasTurn: false });

    const data = (await response.json()) as { iceServers?: RTCIceServer[] };
    return Response.json({ iceServers: data.iceServers ?? DEFAULT_ICE_SERVERS, hasTurn: true });
  } catch (error) {
    return apiError(error);
  }
}
