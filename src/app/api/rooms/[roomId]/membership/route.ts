import { apiError, requireUser } from "@/lib/api";
import { leaveRoom } from "@/lib/rooms";
import { enforceRateLimit, publishSignal } from "@/lib/realtime";

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    await enforceRateLimit(`room-leave:${user.id}`, 10, 60);
    const changedAt = await leaveRoom(roomId, user.id);
    await publishSignal(roomId, user.id, { type: "room:revoked", targetUserId: user.id }, { changedAt });
    await publishSignal(roomId, user.id, { type: "room:members-changed" });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
