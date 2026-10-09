import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exchangeDesktopAuthGrant: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiError(error: unknown) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    const validation = error instanceof Error && error.name === "ZodError";
    return Response.json(
      { error: validation ? "INVALID_REQUEST" : message },
      { status: validation || message === "INVALID_DESKTOP_AUTH" ? 400 : 500 },
    );
  },
}));
vi.mock("@/lib/desktop-auth", () => mocks);

import { POST } from "./route";

const secret = "a".repeat(43);

describe("POST /api/desktop/auth/exchange", () => {
  beforeEach(() => {
    mocks.exchangeDesktopAuthGrant.mockReset();
  });

  it("exchanges a strictly validated one-time grant without caching the response", async () => {
    const result = {
      token: "t".repeat(43),
      expiresAt: "2026-11-08T12:00:00.000Z",
      user: { id: "user-1", name: "Pessoa", image: null },
    };
    mocks.exchangeDesktopAuthGrant.mockResolvedValue(result);

    const response = await POST(new Request("https://janja.live/api/desktop/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: secret, state: secret, verifier: secret }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.exchangeDesktopAuthGrant).toHaveBeenCalledOnce();
    expect(mocks.exchangeDesktopAuthGrant).toHaveBeenCalledWith({ code: secret, state: secret, verifier: secret });
    await expect(response.json()).resolves.toEqual(result);
  });

  it("rejects malformed or additional fields before touching the grant store", async () => {
    const response = await POST(new Request("https://janja.live/api/desktop/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "short", state: secret, verifier: secret, unexpected: true }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.exchangeDesktopAuthGrant).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "INVALID_REQUEST" });
  });

  it("does not disclose why a grant exchange failed", async () => {
    mocks.exchangeDesktopAuthGrant.mockRejectedValue(new Error("INVALID_DESKTOP_AUTH"));

    const response = await POST(new Request("https://janja.live/api/desktop/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: secret, state: secret, verifier: secret }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_DESKTOP_AUTH" });
  });
});
