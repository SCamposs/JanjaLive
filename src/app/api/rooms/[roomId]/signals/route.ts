import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { assertAuthorizedRoom, refreshRoomActivity } from "@/lib/rooms";
import { clientSignalingEventSchema, signalEnvelopeSchema } from "@/lib/schemas";
import { enforceRateLimit, publishSignal, readRoomRealtime } from "@/lib/realtime";

const sinceSchema = z.coerce.number().int().nonnegative().catch(0);

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    await assertAuthorizedRoom(roomId, user.id);
    await refreshRoomActivity(roomId);
    const since = sinceSchema.parse(new URL(request.url).searchParams.get("since"));
    return Response.json(await readRoomRealtime(roomId, user.id, since), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    const input = signalEnvelopeSchema.parse({ ...(await request.json()), roomId });
    await assertAuthorizedRoom(roomId, user.id);
    await enforceRateLimit(`${roomId}:${user.id}:signal`, 240, 60);

    if ("targetUserId" in input) {
      await assertAuthorizedRoom(roomId, input.targetUserId);
    }

    const payload = clientSignalingEventSchema.parse(input);
    await publishSignal(roomId, user.id, payload);
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
