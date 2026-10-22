import { apiError, requireUser } from "@/lib/api";
import { closeRoom } from "@/lib/rooms";
import { publishSignal } from "@/lib/realtime";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser(request);
    const { roomId } = await context.params;
    await closeRoom(roomId, owner.id);
    await publishSignal(roomId, owner.id, { type: "room:closed" });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
