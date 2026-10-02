import { apiError, requireUser } from "@/lib/api";
import { revokeDesktopSession } from "@/lib/desktop-auth";

function getBearerToken(request: Request) {
  return /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("UNAUTHENTICATED");
    await revokeDesktopSession(token);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
