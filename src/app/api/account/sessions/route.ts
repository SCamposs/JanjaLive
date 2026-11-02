import { apiError, requireUser } from "@/lib/api";
import { assertSameOrigin } from "@/lib/request-security";
import { revokeAllUserSessions } from "@/lib/user-sessions";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await revokeAllUserSessions(user.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
