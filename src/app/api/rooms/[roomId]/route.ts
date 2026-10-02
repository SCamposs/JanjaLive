import { apiError, requireUser } from "@/lib/api";
import { deleteRoom } from "@/lib/rooms";

export async function DELETE(_request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser();
    const { roomId } = await context.params;
    await deleteRoom(roomId, owner.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
