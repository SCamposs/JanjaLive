import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), manageRoomMember: vi.fn(), publishSignal: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ requireUser: mocks.requireUser, apiError: () => Response.json({ error: "FORBIDDEN" }, { status: 403 }) }));
vi.mock("@/lib/rooms", () => ({ manageRoomMember: mocks.manageRoomMember }));
vi.mock("@/lib/realtime", () => ({ publishSignal: mocks.publishSignal }));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner" });
  mocks.manageRoomMember.mockResolvedValue(1234);
  mocks.publishSignal.mockResolvedValue(undefined);
});

describe("room membership notifications", () => {
  it.each(["approve", "reject", "revoke"])("refreshes other participants after %s without revoking their access", async (action) => {
    const response = await POST(new Request("https://www.janja.live/api/rooms/room/members", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "friend", action }),
    }), { params: Promise.resolve({ roomId: "room" }) });
    expect(response.status).toBe(200);
    expect(mocks.publishSignal).toHaveBeenCalledWith("room", "owner", {
      type: action === "approve" ? "room:approved" : action === "reject" ? "room:rejected" : "room:revoked", targetUserId: "friend",
    }, { changedAt: 1234 });
    expect(mocks.publishSignal).toHaveBeenLastCalledWith("room", "owner", { type: "room:members-changed" });
  });
  it("does not announce a change that was rejected by authorization", async () => {
    mocks.manageRoomMember.mockRejectedValue(new Error("OWNER_REQUIRED"));
    const response = await POST(new Request("https://www.janja.live/api/rooms/room/members", {
      method: "POST", body: JSON.stringify({ userId: "friend", action: "revoke" }),
    }), { params: Promise.resolve({ roomId: "room" }) });
    expect(response.status).toBe(403);
    expect(mocks.publishSignal).not.toHaveBeenCalled();
  });
});
