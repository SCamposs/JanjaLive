// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRoomMediaCore, type RoomMediaTransport } from "./index";

class Peer {
  static current: Peer;
  connectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  constructor() { Peer.current = this; }
  close() { this.connectionState = "closed"; }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["missing", "muted", "audio-only", "before-connection", "after-connection"])("bounds waiting for the first inbound video (%s)", async (state) => {
  vi.useFakeTimers();
  vi.stubGlobal("RTCPeerConnection", Peer);
  const active = { streamerUserId: "host", preset: "1080p60" as const, width: 1920, height: 1080, frameRate: 60, hasAudio: false, startedAt: Date.now() };
  const transport: RoomMediaTransport = { send: vi.fn().mockResolvedValue(undefined), getIceServers: async () => [], isRoomUnavailable: () => false,
    poll: async () => ({ events: [], cursor: 0, onlineUserIds: ["host", "viewer"], activeStreams: [active] }) };
  const hook = renderHook(() => useRoomMediaCore({ roomId: "room", transport }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await hook.result.current.watch("host"); });
  const peer = Peer.current;
  const track = Object.assign(new EventTarget(), { id: "track", kind: state === "audio-only" ? "audio" : "video", muted: true }) as unknown as MediaStreamTrack;
  const stream = { getTracks: () => [track], addTrack: vi.fn() } as unknown as MediaStream;
  if (state !== "missing") await act(async () => { peer.ontrack!({ track, streams: [stream] }); });
  if (state === "before-connection") await act(async () => { track.dispatchEvent(new Event("unmute")); });
  await act(async () => { peer.connectionState = "connected"; peer.onconnectionstatechange!(); });
  if (state === "after-connection") await act(async () => { track.dispatchEvent(new Event("unmute")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(46_000); });
  if (state === "missing" || state === "muted" || state === "audio-only") {
    expect(peer.connectionState).toBe("closed");
    expect(hook.result.current.connectionError).toContain("vídeo");
    expect(hook.result.current.remoteStreams.host).toBeUndefined();
    expect(transport.send).toHaveBeenCalledWith("room", expect.objectContaining({ type: "watch:stop", targetUserId: "host" }));
  } else {
    expect(peer.connectionState).toBe("connected");
    expect(hook.result.current.remoteStreams.host).toBe(stream);
    expect(hook.result.current.connectionError).toBeNull();
  }
  hook.unmount();
});
