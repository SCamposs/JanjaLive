import { auth } from "@/auth";
import { getDesktopUserFromToken } from "@/lib/desktop-auth";
import { isDesktopVersionSupported } from "@/lib/desktop-version";

export async function requireUser(request?: Request) {
  const authorization = request?.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization);
    if (!match) throw new Error("UNAUTHENTICATED");
    if (!isDesktopVersionSupported(
      request?.headers.get("x-janjalive-desktop-version") ?? null,
      process.env.MINIMUM_DESKTOP_VERSION,
    )) throw new Error("DESKTOP_UPDATE_REQUIRED");
    const desktopUser = await getDesktopUserFromToken(match[1]);
    if (!desktopUser) throw new Error("UNAUTHENTICATED");
    return desktopUser;
  }

  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user;
}

export function apiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const knownErrors: Record<string, number> = {
    INVALID_REQUEST: 400,
    INVALID_DESKTOP_AUTH: 400,
    OWNER_IMMUTABLE: 400,
    RATE_LIMITED: 429,
    UNAUTHENTICATED: 401,
    DESKTOP_UPDATE_REQUIRED: 426,
    ROOM_FORBIDDEN: 403,
    OWNER_REQUIRED: 403,
    ROOM_UNAVAILABLE: 404,
    REALTIME_NOT_CONFIGURED: 503,
  };
  const isValidationError = error instanceof Error && error.name === "ZodError";
  const safeMessage = isValidationError ? "INVALID_REQUEST" : message in knownErrors ? message : "REQUEST_FAILED";
  const status = isValidationError ? 400 : knownErrors[message] ?? 500;
  return Response.json({ error: safeMessage }, { status });
}
