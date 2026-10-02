import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user;
}

export function apiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const knownErrors: Record<string, number> = {
    INVALID_REQUEST: 400,
    OWNER_IMMUTABLE: 400,
    RATE_LIMITED: 429,
    UNAUTHENTICATED: 401,
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
