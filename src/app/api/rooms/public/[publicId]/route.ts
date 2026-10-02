import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { getRoomSnapshotByPublicId } from "@/lib/rooms";

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const user = await requireUser(request);
    const { publicId } = await context.params;
    const safePublicId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).parse(publicId);
    const snapshot = await getRoomSnapshotByPublicId(safePublicId, user.id);
    if (!snapshot) throw new Error("ROOM_UNAVAILABLE");
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
