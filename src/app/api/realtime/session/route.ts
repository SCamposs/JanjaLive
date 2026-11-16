import { apiError, requireUser } from "@/lib/api";
import { createRealtimeSession, enforceRateLimit } from "@/lib/realtime";
import { assertAuthorizedRoom, refreshRoomActivity } from "@/lib/rooms";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const roomId = new URL(request.url).searchParams.get("roomId");
    if (!roomId) throw new Error("INVALID_REQUEST");
    const authorization = await assertAuthorizedRoom(roomId, user.id);
    await enforceRateLimit(`realtime-session:${user.id}`, 30, 60);
    const deadline = authorization?.room.discordGuildId ? authorization.room.discordSessionEndsAt?.getTime() : undefined;
    const session = deadline === undefined ? await createRealtimeSession(roomId, user.id) : await createRealtimeSession(roomId, user.id, deadline);
    await refreshRoomActivity(roomId);
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
