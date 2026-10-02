import { apiError, requireUser } from "@/lib/api";
import { manageRoomMember } from "@/lib/rooms";
import { membershipActionSchema } from "@/lib/schemas";
import { publishSignal } from "@/lib/realtime";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser();
    const { roomId } = await context.params;
    const input = membershipActionSchema.parse(await request.json());
    await manageRoomMember({ roomId, ownerId: owner.id, ...input });
    const eventType = input.action === "approve" ? "room:approved" : input.action === "reject" ? "room:rejected" : "room:revoked";
    await publishSignal(roomId, owner.id, { type: eventType, targetUserId: input.userId }).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
