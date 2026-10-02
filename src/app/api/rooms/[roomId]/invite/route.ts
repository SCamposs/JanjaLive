import { apiError, requireUser } from "@/lib/api";
import { regenerateRoomInvite } from "@/lib/rooms";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const owner = await requireUser(request);
    const { roomId } = await context.params;
    const inviteToken = await regenerateRoomInvite(roomId, owner.id);
    return Response.json({ invitePath: `/room/${inviteToken}` });
  } catch (error) {
    return apiError(error);
  }
}
