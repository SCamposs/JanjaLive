import { createRoomSchema } from "@/lib/schemas";
import { apiError, requireUser } from "@/lib/api";
import { createRoom, listAvailableRooms } from "@/lib/rooms";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ rooms: await listAvailableRooms(user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
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
