import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown) {} } }));
import { RoomDurableObject } from "./index";

function makeSocket(userId: string, issuedAt = 100, protocol = "janjalive-v2") {
    let state = { userId, tokenIssuedAtMs: issuedAt, connectedAt: issuedAt, protocol, mediaSessions: [{ id: `session-${issuedAt}-fixture`, broadcasterUserId: "broadcaster" }] };
    const ws = { readyState: 1, send: vi.fn<(message: string) => void>(), close: vi.fn(() => { ws.readyState = 3; }),
      deserializeAttachment: () => state, serializeAttachment: (next: typeof state) => { state = next; } };
    return ws;
}
function fixture() {
  const sockets: ReturnType<typeof makeSocket>[] = [];
  const socket = (userId: string, issuedAt = 100, protocol = "janjalive-v2") => {
    const ws = makeSocket(userId, issuedAt, protocol);
    sockets.push(ws);
    return ws;
  };
  const storage = new Map<string, unknown>();
  const ctx = { getWebSockets: (tag?: string) => sockets.filter((s) => !tag || tag === `user:${s.deserializeAttachment().userId}`),
    storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); } } };
  const room = new RoomDurableObject(ctx as unknown as DurableObjectState, {} as never);
  return { room, socket, storage };
}
afterEach(() => vi.unstubAllGlobals());
describe("durable room termination", () => {
  it.each(["janjalive-v1", "janjalive-v2"])("notifies honest broadcasters before removing a viewer (%s)", async (protocol) => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const f = fixture();
    const broadcaster = f.socket("broadcaster", 10, protocol);
    const viewer = f.socket("viewer");
    await f.room.fetch(new Request("https://room/event", { method: "POST", body: JSON.stringify({ senderUserId: "owner", changedAt: 200, payload: { type: "room:revoked", targetUserId: "viewer" } }) }));
    const events = broadcaster.send.mock.calls.map(([message]) => JSON.parse(message)).filter((m) => m.type === "event");
    expect(events).toContainEqual(expect.objectContaining({ event: expect.objectContaining({ senderUserId: "viewer", payload: protocol === "janjalive-v1" ? { type: "watch:stop", targetUserId: "broadcaster" } : { type: "watch:stop", targetUserId: "broadcaster", mediaSessionId: "session-100-fixture" } }) }));
    expect(viewer.close).toHaveBeenCalledWith(4003, "Access revoked");
    expect(broadcaster.close).not.toHaveBeenCalled();
  });
  it("a logout retry terminates old peers but preserves a fresh login", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const f = fixture();
    const broadcaster = f.socket("broadcaster");
    const old = f.socket("viewer", 100);
    const fresh = f.socket("viewer", 300);
    const request = () => new Request("https://room/access", { method: "POST", body: JSON.stringify({ action: "BAN", senderUserId: "viewer", targetUserId: "viewer", changedAt: 200 }) });
    await f.room.fetch(request());
    await f.room.fetch(request());
    const events = broadcaster.send.mock.calls.map(([message]) => JSON.parse(message)).filter((m) => m.type === "event");
    expect(events.some((m) => m.event.payload.mediaSessionId === "session-100-fixture")).toBe(true);
    expect(events.some((m) => m.event.payload.mediaSessionId === "session-300-fixture")).toBe(false);
    expect(old.close).toHaveBeenCalled();
    expect(fresh.close).not.toHaveBeenCalled();
  });
  it("notifies senders even when the malicious viewer already dropped signaling", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const f = fixture();
    const broadcaster = f.socket("broadcaster");
    await f.room.fetch(new Request("https://room/event", { method: "POST", body: JSON.stringify({ senderUserId: "broadcaster", changedAt: 200, payload: { type: "room:revoked", targetUserId: "disconnected-viewer" } }) }));
    expect(broadcaster.send.mock.calls.map(([message]) => JSON.parse(message))).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({ payload: { type: "room:peer-revoked", targetUserId: "disconnected-viewer", changedAt: 200 } }),
    }));
  });
  it("durably closes admitted sockets and rejects a later connection", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const f = fixture();
    const socket = f.socket("viewer");
    await f.room.fetch(new Request("https://room/event", { method: "POST", body: JSON.stringify({ senderUserId: "owner", payload: { type: "room:closed" } }) }));
    expect(socket.close).toHaveBeenCalledWith(4004, "Room closed");
    const response = await f.room.fetch(new Request("https://room/connect", { headers: { upgrade: "websocket", "x-janjalive-user-id": "viewer", "x-janjalive-token-issued-at": "1" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "ROOM_CLOSED" });
  });
});
