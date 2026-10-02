import { apiError, requireUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/realtime";
import { resolveRoomCode } from "@/lib/rooms";
import { roomCodeSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(`room-code:${user.id}`, 10, 60);
    const { code } = roomCodeSchema.parse(await request.json());
    const publicId = await resolveRoomCode(code);
    if (!publicId) throw new Error("ROOM_UNAVAILABLE");
    return Response.json({ joinPath: `/join/${publicId}` });
  } catch (error) {
    return apiError(error);
  }
}
