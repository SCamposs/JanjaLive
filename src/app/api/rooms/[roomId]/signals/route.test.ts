import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertAuthorizedRoom: vi.fn(), publishSignal: vi.fn(), enforceRateLimit: vi.fn(), readRoomRealtime: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireUser: mocks.requireUser, apiError: () => Response.json({ error: "INVALID" }, { status: 400 }) }));
vi.mock("@/lib/rooms", () => ({ assertAuthorizedRoom: mocks.assertAuthorizedRoom, refreshRoomActivity: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ publishSignal: mocks.publishSignal, enforceRateLimit: mocks.enforceRateLimit, readRoomRealtime: mocks.readRoomRealtime }));
import { GET, POST } from "./route";
const roomId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ roomId }) };
beforeEach(() => { vi.resetAllMocks(); mocks.requireUser.mockResolvedValue({ id: "viewer" }); });
it.each([{ type: "presence:join" }, { type: "watch:request", targetUserId: "broadcaster", mediaSessionId: "session-valid-fixture" }])("publishes a valid HTTP event without envelope fields: %j", async (payload) => {
  const response = await POST(new Request("https://www.janja.live/api/rooms/room/signals", { method: "POST", body: JSON.stringify(payload) }), context);
  expect(response.status).toBe(202);
  expect(mocks.publishSignal).toHaveBeenCalledWith(roomId, "viewer", payload, { authorizationIssuedAt: expect.any(Number) });
  if ("targetUserId" in payload) expect(mocks.assertAuthorizedRoom).toHaveBeenCalledWith(roomId, payload.targetUserId);
});
it.each([{ type: "room:closed" }, { type: "room:peer-revoked", targetUserId: "owner", changedAt: 123 }, { type: "presence:join", roomId }, { type: "presence:join", authorizationIssuedAt: 9999 }])("rejects server-only or extra client fields: %j", async (payload) => {
  expect((await POST(new Request("https://www.janja.live/api/rooms/room/signals", { method: "POST", body: JSON.stringify(payload) }), context)).status).toBe(400);
  expect(mocks.publishSignal).not.toHaveBeenCalled();
});
it.each(["0.1.32", "0.1.33"])("preserves the supported desktop HTTP envelope for %s", async (version) => {
  mocks.readRoomRealtime.mockResolvedValue({ activityRefreshDue: false, realtime: { events: [{ id: "e", sentAt: 300, authorizationIssuedAt: 100, payload: { type: "presence:join" } }], cursor: 1, onlineUserIds: [], activeStreams: [] } });
  const response = await GET(new Request("https://www.janja.live/api/rooms/room/signals", { headers: { "x-janjalive-desktop-version": version } }), context);
  const body = await response.json();
  expect(body.events[0].authorizationIssuedAt).toBe(version === "0.1.33" ? 100 : undefined);
  expect(body.events[0].sentAt).toBe(300);
});
