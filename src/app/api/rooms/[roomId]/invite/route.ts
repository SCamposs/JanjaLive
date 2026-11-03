import { apiError, requireUser } from "@/lib/api";
import { assertAuthorizedRoom, regenerateRoomInvite } from "@/lib/rooms";
import { createShareableInvite } from "@/lib/shareable-invite";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    const { room } = await assertAuthorizedRoom(roomId, user.id);
    return Response.json({ invitePath: `/room/${createShareableInvite(room)}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

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
