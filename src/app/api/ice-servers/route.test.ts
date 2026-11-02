import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertAuthorizedRoom: vi.fn(), enforceRateLimit: vi.fn(), generateTurnCredentials: vi.fn(), revokeUserTurnCredentials: vi.fn(), getActiveUserById: vi.fn() }));
vi.mock("@/lib/api", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : "REQUEST_FAILED" },
    { status: error instanceof Error && error.message === "ACCOUNT_DISABLED" ? 403 : 500 },
  ),
}));
vi.mock("@/lib/rooms", () => ({ assertAuthorizedRoom: mocks.assertAuthorizedRoom }));
vi.mock("@/lib/realtime", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/turn", () => ({ generateTurnCredentials: mocks.generateTurnCredentials, revokeUserTurnCredentials: mocks.revokeUserTurnCredentials }));
vi.mock("@/lib/account-access", () => ({ getActiveUserById: mocks.getActiveUserById }));

import { GET } from "./route";

describe("GET /api/ice-servers", () => {
  beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); delete process.env.TURN_ENABLED; });

  it("does not issue TURN credentials to a banned account", async () => {
    mocks.requireUser.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
    const response = await GET(new Request("https://www.janja.live/api/ice-servers?roomId=11111111-1111-4111-8111-111111111111"));

    expect(response.status).toBe(403);
    expect(mocks.assertAuthorizedRoom).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("uses one global per-user budget across rooms and marks credentials non-cacheable", async () => {
    mocks.requireUser.mockResolvedValue({ id: "viewer" });
    mocks.generateTurnCredentials.mockResolvedValue([{ urls: "turn:relay.example", username: "temporary", credential: "test-only" }]);
    const response = await GET(new Request("https://www.janja.live/api/ice-servers?roomId=11111111-1111-4111-8111-111111111111"));
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("turn:viewer", 60, 3600);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).hasTurn).toBe(true);
  });

  it("returns STUN without contacting TURN during an emergency pause", async () => {
    process.env.TURN_ENABLED = "false";
    mocks.requireUser.mockResolvedValue({ id: "viewer" });
    const response = await GET(new Request("https://www.janja.live/api/ice-servers?roomId=11111111-1111-4111-8111-111111111111"));
    expect((await response.json()).hasTurn).toBe(false);
    expect(mocks.generateTurnCredentials).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    delete process.env.TURN_ENABLED;
  });

  it("revokes a credential generated during a concurrent ban instead of returning it", async () => {
    mocks.requireUser.mockResolvedValue({ id: "viewer" });
    mocks.generateTurnCredentials.mockResolvedValue([{ urls: "turn:relay.example" }]);
    mocks.getActiveUserById.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
    const response = await GET(new Request("https://www.janja.live/api/ice-servers?roomId=11111111-1111-4111-8111-111111111111"));
    expect(response.status).toBe(403);
    expect(mocks.revokeUserTurnCredentials).toHaveBeenCalledWith("viewer");
  });
});
