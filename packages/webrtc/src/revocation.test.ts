// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRoomMediaCore, type RealtimePoll, type RoomMediaTransport, type ServerSignal } from "./index";

class Peer {
  static instances: Peer[] = [];
  connectionState: RTCPeerConnectionState = "new";
  signalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  constructor() { Peer.instances.push(this); }
  getSenders() { return []; }
  addTrack() { return { getParameters: () => ({ encodings: [{}] }), setParameters: async () => undefined }; }
  async createOffer() { return { type: "offer", sdp: "offer" }; }
  async createAnswer() { return { type: "answer", sdp: "answer" }; }
  async setRemoteDescription(value: RTCSessionDescriptionInit) { this.remoteDescription = value; }
  async setLocalDescription(value: RTCSessionDescriptionInit) { this.localDescription = value; this.signalingState = "have-local-offer"; }
  close() { this.connectionState = "closed"; }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["watch:stop", "room:peer-revoked"] as const)("cuts the honest sender's old peer on %s without trusting the receiver", async (type) => {
  vi.useFakeTimers();
  Peer.instances = [];
  vi.stubGlobal("RTCPeerConnection", Peer);
  let events: RealtimePoll["events"] = [];
  let cursor = 0;
  const event = (senderUserId: string, payload: ServerSignal, sentAt = 100) => ({ id: String(++cursor), senderUserId, payload, cursor, sentAt });
  const transport: RoomMediaTransport = { send: vi.fn().mockResolvedValue(undefined), getIceServers: async () => [], isRoomUnavailable: () => false,
    poll: async () => { const batch = events; events = []; return { events: batch, cursor, onlineUserIds: ["broadcaster", "viewer", "other"], activeStreams: [] }; } };
  const hook = renderHook(() => useRoomMediaCore({ roomId: "room", transport }));
  const stream = { getTracks: () => [{ kind: "video", stop: vi.fn() }] } as unknown as MediaStream;
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await hook.result.current.startBroadcast(stream, { preset: "720p30", width: 1280, height: 720, frameRate: 30, hasAudio: false }, 1_000_000); });
  events = [event("viewer", { type: "watch:request", targetUserId: "broadcaster", mediaSessionId: "old-session-fixture" }), event("other", { type: "watch:request", targetUserId: "broadcaster", mediaSessionId: "other-session-fixture" })];
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  expect(Peer.instances).toHaveLength(2);
  events = [event(type === "watch:stop" ? "viewer" : "owner", type === "watch:stop" ? { type, targetUserId: "broadcaster", mediaSessionId: "old-session-fixture" } : { type, targetUserId: "viewer", changedAt: 200 }, 200)];
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(Peer.instances[0].connectionState).toBe("closed");
  expect(Peer.instances[1].connectionState).not.toBe("closed");
  expect(hook.result.current.roomUnavailable).toBe(false);
  events = [event("viewer", { type: "watch:request", targetUserId: "broadcaster", mediaSessionId: "fresh-session-fixture" }, 300)];
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(Peer.instances).toHaveLength(3);
  if (type === "room:peer-revoked") {
    events = [event("owner", { type, targetUserId: "viewer", changedAt: 200 }, 400)];
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(Peer.instances[2].connectionState).not.toBe("closed");
  }
  hook.unmount();
});

it("does not recreate a revoked viewer after a pending ICE lookup completes", async () => {
  vi.useFakeTimers();
  Peer.instances = [];
  vi.stubGlobal("RTCPeerConnection", Peer);
  let resolveIce!: (servers: RTCIceServer[]) => void;
  const ice = new Promise<RTCIceServer[]>((resolve) => { resolveIce = resolve; });
  let events: RealtimePoll["events"] = [{ id: "watch", cursor: 1, sentAt: 100, senderUserId: "viewer", payload: { type: "watch:request", targetUserId: "owner", mediaSessionId: "late-session-fixture" } }];
  const transport: RoomMediaTransport = { send: async () => undefined, getIceServers: () => ice, isRoomUnavailable: () => false,
    poll: async () => { const batch = events; events = []; return { events: batch, cursor: batch.at(-1)?.cursor ?? 1, onlineUserIds: ["owner"], activeStreams: [] }; } };
  const hook = renderHook(() => useRoomMediaCore({ roomId: "room", transport }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  let start!: Promise<void>;
  await act(async () => { start = hook.result.current.startBroadcast({ getTracks: () => [] } as unknown as MediaStream, { preset: "720p30", width: 1280, height: 720, frameRate: 30, hasAudio: false }, 1_000_000); });
  events = [{ id: "revoke", cursor: 2, sentAt: 200, senderUserId: "owner", payload: { type: "room:peer-revoked", targetUserId: "viewer", changedAt: 200 } }];
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  await act(async () => { resolveIce([]); await start; });
  expect(Peer.instances).toHaveLength(0);
  hook.unmount();
});

it("also closes an inbound peer from a removed broadcaster using server event times", async () => {
  vi.useFakeTimers();
  Peer.instances = [];
  vi.stubGlobal("RTCPeerConnection", Peer);
  let events: RealtimePoll["events"] = [];
  const send = vi.fn().mockResolvedValue(undefined);
  const transport: RoomMediaTransport = { send, getIceServers: async () => [], isRoomUnavailable: () => false,
    poll: async () => { const batch = events; events = []; return { events: batch, cursor: batch.at(-1)?.cursor ?? 0, onlineUserIds: ["viewer", "broadcaster"], activeStreams: [] }; } };
  const hook = renderHook(() => useRoomMediaCore({ roomId: "room", transport }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await hook.result.current.watch("broadcaster"); });
  const request = send.mock.calls.find(([, payload]) => payload.type === "watch:request")![1];
  events = [{ id: "offer", cursor: 1, sentAt: 100, senderUserId: "broadcaster", payload: { type: "webrtc:offer", targetUserId: "viewer", mediaSessionId: request.mediaSessionId, description: { type: "offer", sdp: "offer" } } },
    { id: "cutoff", cursor: 2, sentAt: 200, senderUserId: "owner", payload: { type: "room:peer-revoked", targetUserId: "broadcaster", changedAt: 200 } }];
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  expect(Peer.instances[0].connectionState).toBe("closed");
  expect(hook.result.current.roomUnavailable).toBe(false);
  hook.unmount();
});
