import { apiError, requireUser } from "@/lib/api";
import { assertAuthorizedRoom, closeRoom } from "@/lib/rooms";
import { canManageRoom } from "@/lib/room-policy";
import { publishSignal } from "@/lib/realtime";

export async function POST(_request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser();
    const { roomId } = await context.params;
    const { member } = await assertAuthorizedRoom(roomId, owner.id);
    if (!canManageRoom(member)) throw new Error("OWNER_REQUIRED");
    await publishSignal(roomId, owner.id, { type: "room:closed" }).catch(() => undefined);
    await closeRoom(roomId, owner.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
