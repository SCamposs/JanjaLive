import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), leaveRoom: vi.fn(), publishSignal: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireUser: mocks.requireUser, apiError: () => Response.json({ error: "FORBIDDEN" }, { status: 403 }) }));
vi.mock("@/lib/rooms", () => ({ leaveRoom: mocks.leaveRoom }));
vi.mock("@/lib/realtime", () => ({ publishSignal: mocks.publishSignal, enforceRateLimit: mocks.enforceRateLimit }));
import { DELETE } from "./route";

beforeEach(() => { vi.resetAllMocks(); mocks.requireUser.mockResolvedValue({ id: "current-user" }); mocks.leaveRoom.mockResolvedValue(1234); });
const context = { params: Promise.resolve({ roomId: "room" }) };
describe("self membership removal", () => {
  it("uses the authenticated identity even when another identity is submitted", async () => {
    const response = await DELETE(new Request("https://www.janja.live/api/rooms/room/membership", { method: "DELETE", body: JSON.stringify({ userId: "someone-else" }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.leaveRoom).toHaveBeenCalledWith("room", "current-user");
    expect(mocks.publishSignal).toHaveBeenCalledWith("room", "current-user", { type: "room:revoked", targetUserId: "current-user" }, { changedAt: 1234 });
    expect(mocks.publishSignal).toHaveBeenLastCalledWith("room", "current-user", { type: "room:members-changed" });
  });
  it("does not revoke or notify when authentication fails", async () => {
    mocks.requireUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await DELETE(new Request("https://www.janja.live/api/rooms/room/membership", { method: "DELETE" }), context)).status).toBe(403);
    expect(mocks.leaveRoom).not.toHaveBeenCalled(); expect(mocks.publishSignal).not.toHaveBeenCalled();
  });
  it("does not announce a blocked owner or missing membership", async () => {
    mocks.leaveRoom.mockRejectedValue(new Error("OWNER_IMMUTABLE"));
    expect((await DELETE(new Request("https://www.janja.live/api/rooms/room/membership", { method: "DELETE" }), context)).status).toBe(403);
    expect(mocks.publishSignal).not.toHaveBeenCalled();
  });
  it("does not report success if realtime revocation fails", async () => {
    mocks.publishSignal.mockRejectedValue(new Error("REALTIME_UNAVAILABLE"));
    expect((await DELETE(new Request("https://www.janja.live/api/rooms/room/membership", { method: "DELETE" }), context)).status).toBe(403);
  });
  it("stops repeated requests before changing membership when rate limited", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("RATE_LIMITED"));
    await DELETE(new Request("https://www.janja.live/api/rooms/room/membership", { method: "DELETE" }), context);
    expect(mocks.leaveRoom).not.toHaveBeenCalled(); expect(mocks.publishSignal).not.toHaveBeenCalled();
  });
});
