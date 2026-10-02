import { apiError, requireUser } from "@/lib/api";
import { requestRoomAccess } from "@/lib/rooms";
import { enforceRateLimit, publishSignal } from "@/lib/realtime";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    await enforceRateLimit(`room-request:${roomId}:${user.id}`, 5, 60);
    await requestRoomAccess(roomId, user.id);
    await publishSignal(roomId, user.id, { type: "room:join-request" }).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
