import { apiError, requireUser } from "@/lib/api";
import { closeRoom } from "@/lib/rooms";
import { publishSignal } from "@/lib/realtime";
import { scheduleClosedCallCard } from "@/lib/discord/notifications";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser(request);
    const { roomId } = await context.params;
    const room = await closeRoom(roomId, owner.id);
    await publishSignal(roomId, owner.id, { type: "room:closed" });
    scheduleClosedCallCard(room);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
