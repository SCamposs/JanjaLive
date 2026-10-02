import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { getRoomSnapshot } from "@/lib/rooms";

const inviteSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/) }).strict();

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { token } = inviteSchema.parse(await request.json());
    const snapshot = await getRoomSnapshot(token, user.id);
    if (!snapshot) throw new Error("ROOM_UNAVAILABLE");
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
