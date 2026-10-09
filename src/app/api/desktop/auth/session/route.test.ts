import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), revokeDesktopSession: vi.fn() }));

vi.mock("@/lib/api", () => ({
  requireUser: mocks.requireUser,
  apiError(error: unknown) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    return Response.json(
      { error: message === "UNAUTHENTICATED" ? message : "REQUEST_FAILED" },
      { status: message === "UNAUTHENTICATED" ? 401 : 500 },
    );
  },
}));
vi.mock("@/lib/desktop-auth", () => ({ revokeDesktopSession: mocks.revokeDesktopSession }));

import { DELETE, GET } from "./route";

const token = "t".repeat(43);

describe("/api/desktop/auth/session", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.revokeDesktopSession.mockReset();
  });

  it("returns the authenticated desktop user without caching it", async () => {
    const user = { id: "user-1", name: "Pessoa", image: null };
    mocks.requireUser.mockResolvedValue(user);
    const request = new Request("https://janja.live/api/desktop/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.requireUser).toHaveBeenCalledWith(request);
    await expect(response.json()).resolves.toEqual({ user });
  });

  it("revokes only a syntactically valid bearer token", async () => {
    const response = await DELETE(new Request("https://janja.live/api/desktop/auth/session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.revokeDesktopSession).toHaveBeenCalledOnce();
    expect(mocks.revokeDesktopSession).toHaveBeenCalledWith(token);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects malformed authorization without calling revocation", async () => {
    const response = await DELETE(new Request("https://janja.live/api/desktop/auth/session", {
      method: "DELETE",
      headers: { Authorization: "Bearer short" },
    }));

    expect(response.status).toBe(401);
    expect(mocks.revokeDesktopSession).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "UNAUTHENTICATED" });
  });
});
