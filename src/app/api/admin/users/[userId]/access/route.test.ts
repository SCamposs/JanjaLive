import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  setUserAccess: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/account-access", () => ({ setUserAccess: mocks.setUserAccess }));
vi.mock("@/lib/realtime", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/api", () => ({
  apiError(error: unknown) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    const validation = error instanceof Error && error.name === "ZodError";
    const status = validation ? 400 : message === "ORIGIN_FORBIDDEN" ? 403 : 500;
    return Response.json({ error: validation ? "INVALID_REQUEST" : message }, { status });
  },
}));

import { POST } from "./route";

function request(body: unknown, origin = "https://www.janja.live") {
  return new Request("https://www.janja.live/api/admin/users/user-2/access", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ userId: "user-2" }) };

describe("POST /api/admin/users/:userId/access", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.setUserAccess.mockReset();
    mocks.enforceRateLimit.mockReset();
  });

  it("rejects a cross-origin mutation before authentication or database access", async () => {
    const response = await POST(request({ action: "BAN" }, "https://lookalike.example"), context);

    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.setUserAccess).not.toHaveBeenCalled();
  });

  it("hides the endpoint from non-owners", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));

    const response = await POST(request({ action: "BAN" }), context);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.setUserAccess).not.toHaveBeenCalled();
  });

  it("strictly validates the mutation body", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "owner" });

    const response = await POST(request({ action: "BAN", extra: true }), context);

    expect(response.status).toBe(400);
    expect(mocks.setUserAccess).not.toHaveBeenCalled();
  });

  it("rate limits and executes a valid owner mutation", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "owner" });
    mocks.setUserAccess.mockResolvedValue({ changed: true });

    const response = await POST(request({ action: "BAN", reason: "teste" }), context);

    expect(response.status).toBe(200);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("admin:owner:access", 30, 60);
    expect(mocks.setUserAccess).toHaveBeenCalledWith({ actorUserId: "owner", targetUserId: "user-2", action: "BAN", reason: "teste" });
  });
});
