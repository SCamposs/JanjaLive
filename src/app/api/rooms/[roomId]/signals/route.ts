import { z } from "zod";
import { apiError, requireUser } from "@/lib/api";
import { assertAuthorizedRoom, refreshRoomActivity } from "@/lib/rooms";
import { clientSignalingEventSchema, signalEnvelopeSchema } from "@/lib/schemas";
import { enforceRateLimit, publishSignal, readRoomRealtime } from "@/lib/realtime";
import { isDesktopVersionSupported } from "@/lib/desktop-version";

const sinceSchema = z.coerce.number().int().nonnegative().catch(0);

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireUser(request);
    const { roomId } = await context.params;
    await assertAuthorizedRoom(roomId, user.id);
    const since = sinceSchema.parse(new URL(request.url).searchParams.get("since"));
    const { realtime, activityRefreshDue } = await readRoomRealtime(roomId, user.id, since);
    if (activityRefreshDue) await refreshRoomActivity(roomId);
    const desktopVersion = request.headers.get("x-janjalive-desktop-version");
    // Older desktop builds validate the event envelope strictly. Preserve their
    // HTTP wire format while updated senders consume the authorization stamp.
    const result = desktopVersion && !isDesktopVersionSupported(desktopVersion, "0.1.33")
      ? { ...realtime, events: realtime.events.map(({ authorizationIssuedAt, ...event }) => { void authorizationIssuedAt; return event; }) }
      : realtime;
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const authorizationIssuedAt = Date.now();
    const user = await requireUser(request);
    const { roomId } = await context.params;
    const payload = clientSignalingEventSchema.parse(await request.json());
    signalEnvelopeSchema.parse({ ...payload, roomId });
    await assertAuthorizedRoom(roomId, user.id);
    await enforceRateLimit(`${roomId}:${user.id}:signal`, 240, 60);

    if ("targetUserId" in payload) {
      await assertAuthorizedRoom(roomId, payload.targetUserId);
    }

    await publishSignal(roomId, user.id, payload, { authorizationIssuedAt });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
