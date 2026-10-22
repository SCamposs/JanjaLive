import { z } from "zod";
import { apiError } from "@/lib/api";
import { setUserAccess } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";
import { enforceRateLimit } from "@/lib/realtime";
import { assertSameOrigin } from "@/lib/request-security";

const bodySchema = z.object({
  action: z.enum(["BAN", "UNBAN"]),
  reason: z.string().trim().max(240).optional(),
}).strict();
const userIdSchema = z.string().min(1).max(128);

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    await enforceRateLimit(`admin:${admin.id}:access`, 30, 60);
    const userId = userIdSchema.parse((await context.params).userId);
    const result = await setUserAccess({ actorUserId: admin.id, targetUserId: userId, ...bodySchema.parse(await request.json()) });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return new Response(null, { status: 404 });
    return apiError(error);
  }
}
