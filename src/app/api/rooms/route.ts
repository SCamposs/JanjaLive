import { createRoomSchema } from "@/lib/schemas";
import { apiError, requireUser } from "@/lib/api";
import { createRoom } from "@/lib/rooms";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createRoomSchema.parse(await request.json());
    const room = await createRoom({ userId: user.id, ...input });
    return Response.json({
      roomId: room.id,
      invitePath: `/room/${room.inviteToken}`,
    });
  } catch (error) {
    return apiError(error);
  }
}
