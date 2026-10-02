import { apiError, requireUser } from "@/lib/api";
import { deleteRoom, getAuthorizedRoomSnapshot } from "@/lib/rooms";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    const snapshot = await getAuthorizedRoomSnapshot(roomId, user.id);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser(request);
    const { roomId } = await context.params;
    await deleteRoom(roomId, owner.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
