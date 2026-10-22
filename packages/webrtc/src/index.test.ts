// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdaptiveRoomMediaTransport,
  getReconnectDelay,
  getPeerConnectionStatus,
  getRoomPollInterval,
  getRoomSignalDirective,
  isTransientPeerSignal,
  MAX_PENDING_CANDIDATES_PER_SESSION,
  MAX_PENDING_MEDIA_SESSIONS_PER_REMOTE,
  queuePendingCandidate,
  replacePeerTracks,
  shouldApplyRemoteAnswer,
  shouldPauseRoomPolling,
  useRoomMediaCore,
  type RealtimePoll,
  type RoomMediaTransport,
} from "./index";

function createTransport(poll: () => Promise<RealtimePoll>): RoomMediaTransport {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    poll: vi.fn(poll),
    getIceServers: vi.fn().mockResolvedValue([]),
    isRoomUnavailable: () => false,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared room media lifecycle", () => {
  it("receives the initial Cloudflare snapshot even when it follows the open event immediately", async () => {
    class WebSocketStub extends EventTarget {
      static OPEN = 1;
      static last: WebSocketStub | null = null;
      readyState = 0;
      send = vi.fn();
      constructor(public url: string, public protocols: string[]) {
        super();
        WebSocketStub.last = this;
        queueMicrotask(() => {
          this.readyState = WebSocketStub.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", {
            data: JSON.stringify({
              type: "snapshot",
              onlineUserIds: ["viewer"],
              activeStreams: [],
            }),
          }));
        });
      }
      close() {
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close", { code: 1000 }));
      }
    }
    vi.stubGlobal("WebSocket", WebSocketStub);
    const getSession = vi.fn().mockResolvedValue({
      provider: "cloudflare",
      url: "https://realtime.example.com",
      token: "signed-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const transport = createAdaptiveRoomMediaTransport({
      getSession,
      legacySend: vi.fn(),
      legacyPoll: vi.fn(),
      getIceServers: vi.fn().mockResolvedValue([]),
      isRoomUnavailable: () => false,
    });

    await transport.send("room-a", { type: "presence:join" });
    await expect(transport.poll("room-a", 0)).resolves.toMatchObject({
      onlineUserIds: ["viewer"],
      activeStreams: [],
    });
    expect(getSession).toHaveBeenCalledOnce();
    expect(WebSocketStub.last?.protocols).toEqual(["janjalive-v2", "janjalive-token.signed-token"]);
    expect(WebSocketStub.last?.send).toHaveBeenCalledWith(JSON.stringify({
      type: "signal",
      payload: { type: "presence:join" },
    }));
    transport.close?.("room-a");
  });

  it("restores presence, publication and watch intent after the signaling socket reconnects", async () => {
    class WebSocketStub extends EventTarget {
      static OPEN = 1;
      static instances: WebSocketStub[] = [];
      readyState = 0;
      send = vi.fn();
      constructor() {
        super();
        WebSocketStub.instances.push(this);
        queueMicrotask(() => {
          this.readyState = WebSocketStub.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", {
            data: JSON.stringify({ type: "snapshot", onlineUserIds: [], activeStreams: [] }),
          }));
        });
      }
      close(code = 1000) {
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close", { code }));
      }
    }
    vi.stubGlobal("WebSocket", WebSocketStub);
    const transport = createAdaptiveRoomMediaTransport({
      getSession: vi.fn().mockResolvedValue({
        provider: "cloudflare",
        url: "https://realtime.example.com",
        token: "signed-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      legacySend: vi.fn(),
      legacyPoll: vi.fn(),
      getIceServers: vi.fn().mockResolvedValue([]),
      isRoomUnavailable: () => false,
    });
    const metadata = { preset: "1080p60" as const, width: 1920, height: 1080, frameRate: 60, hasAudio: true };
    const mediaSessionId = "session-reconnect-01";

    await transport.send("room-a", { type: "presence:join" });
    await transport.send("room-a", { type: "stream:start", metadata });
    await transport.send("room-a", { type: "watch:request", targetUserId: "friend", mediaSessionId });
    WebSocketStub.instances[0]?.close(1006);
    await transport.poll("room-a", 0);

    const replayed = WebSocketStub.instances[1]?.send.mock.calls.map(([message]) => JSON.parse(message as string).payload);
    expect(replayed).toEqual(expect.arrayContaining([
      { type: "presence:join" },
      { type: "stream:start", metadata },
      { type: "watch:request", targetUserId: "friend", mediaSessionId },
    ]));
    transport.close?.("room-a");
  });

  it("invalidates a stale in-flight socket when the logical client changes rooms", async () => {
    class WebSocketStub extends EventTarget {
      static OPEN = 1;
      static instances: WebSocketStub[] = [];
      readyState = 0;
      send = vi.fn();
      closed = false;
      constructor() { super(); WebSocketStub.instances.push(this); }
      open() {
        this.readyState = WebSocketStub.OPEN;
        this.dispatchEvent(new Event("open"));
      }
      close(code = 1000) {
        this.closed = true;
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close", { code }));
      }
    }
    vi.stubGlobal("WebSocket", WebSocketStub);
    const transport = createAdaptiveRoomMediaTransport({
      getSession: vi.fn().mockResolvedValue({
        provider: "cloudflare",
        url: "https://realtime.example.com",
        token: "signed-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      legacySend: vi.fn(),
      legacyPoll: vi.fn(),
      getIceServers: vi.fn().mockResolvedValue([]),
      isRoomUnavailable: () => false,
    });

    const staleSend = transport.send("room-a", { type: "presence:join" });
    await waitFor(() => expect(WebSocketStub.instances).toHaveLength(1));
    const currentSend = transport.send("room-b", { type: "presence:join" });
    await waitFor(() => expect(WebSocketStub.instances).toHaveLength(2));
    WebSocketStub.instances[1]?.open();
    await currentSend;
    WebSocketStub.instances[0]?.open();

    await expect(staleSend).rejects.toThrow("REALTIME_CONNECTION_SUPERSEDED");
    expect(WebSocketStub.instances[0]?.closed).toBe(true);
    expect(WebSocketStub.instances[1]?.send).toHaveBeenCalledWith(JSON.stringify({
      type: "signal",
      payload: { type: "presence:join" },
    }));
    transport.close?.("room-b");
  });

  it("ends the room locally when it is closed or access is revoked", () => {
    expect(getRoomSignalDirective({ type: "room:closed" })).toMatchObject({
      membershipChanged: true,
      roomUnavailable: true,
    });
    expect(getRoomSignalDirective({ type: "room:revoked", targetUserId: "user" })).toMatchObject({
      membershipChanged: true,
      roomUnavailable: true,
    });
  });

  it("keeps ordinary media events separate from room lifecycle events", () => {
    expect(getRoomSignalDirective({ type: "watch:stop", targetUserId: "user", mediaSessionId: "session-fixture-01" })).toEqual({
      membershipChanged: false,
      roomUnavailable: false,
    });
    expect(getRoomSignalDirective({ type: "stream:stop" }).roomUnavailable).toBe(false);
  });

  it("caps reconnect backoff without creating a hot retry loop", () => {
    expect(getReconnectDelay(1)).toBe(2_000);
    expect(getReconnectDelay(2)).toBe(4_000);
    expect(getReconnectDelay(20)).toBe(12_000);
  });

  it("does not report a media connection as good while its peer is still connecting", () => {
    expect(getPeerConnectionStatus([])).toBe("good");
    expect(getPeerConnectionStatus(["new", "connecting"])).toBe("connecting");
    expect(getPeerConnectionStatus(["disconnected"])).toBe("unstable");
    expect(getPeerConnectionStatus(["connected"])).toBe("good");
  });

  it("does not replay peer negotiation into a newly opened room session", () => {
    expect(isTransientPeerSignal({ type: "webrtc:ice-candidate", targetUserId: "user", mediaSessionId: "session-fixture-01", candidate: { candidate: "candidate" } })).toBe(true);
    expect(isTransientPeerSignal({ type: "watch:request", targetUserId: "user", mediaSessionId: "session-fixture-01" })).toBe(true);
    expect(isTransientPeerSignal({ type: "room:closed" })).toBe(false);
    expect(isTransientPeerSignal({ type: "stream:start", metadata: { preset: "720p30", width: 1280, height: 720, frameRate: 30, hasAudio: false } })).toBe(false);
  });

  it("bounds early ICE by sender, session and candidate count", () => {
    const pending = new Map();
    for (let index = 0; index < MAX_PENDING_CANDIDATES_PER_SESSION; index += 1) {
      expect(queuePendingCandidate(pending, "session-candidate-cap", "sender", { candidate: `candidate:${index}` })).toBe(true);
    }
    expect(queuePendingCandidate(pending, "session-candidate-cap", "sender", { candidate: "overflow" })).toBe(false);
    for (let index = 1; index < MAX_PENDING_MEDIA_SESSIONS_PER_REMOTE; index += 1) {
      expect(queuePendingCandidate(pending, `session-sender-${index}`, "sender", { candidate: "candidate" })).toBe(true);
    }
    expect(queuePendingCandidate(pending, "session-sender-overflow", "sender", { candidate: "candidate" })).toBe(false);
    expect(queuePendingCandidate(pending, "session-candidate-cap", "different-sender", { candidate: "candidate" })).toBe(false);
  });

  it("polls faster only while negotiating a peer connection", () => {
    expect(getRoomPollInterval([])).toBe(1_500);
    expect(getRoomPollInterval(["new"])).toBe(300);
    expect(getRoomPollInterval(["connecting"])).toBe(300);
    expect(getRoomPollInterval(["connected"])).toBe(1_500);
  });

  it("pauses an inactive hidden room without interrupting a broadcast or viewer", () => {
    expect(shouldPauseRoomPolling("hidden", false, 0)).toBe(true);
    expect(shouldPauseRoomPolling("visible", false, 0)).toBe(false);
    expect(shouldPauseRoomPolling("hidden", true, 0)).toBe(false);
    expect(shouldPauseRoomPolling("hidden", false, 1)).toBe(false);
  });

  it("applies an answer once and ignores repeated or stale answers", () => {
    const answer = { type: "answer" as const, sdp: "v=0\r\n" };
    expect(shouldApplyRemoteAnswer("have-local-offer", null, answer)).toBe(true);
    expect(shouldApplyRemoteAnswer("stable", answer as RTCSessionDescription, answer)).toBe(false);
    expect(shouldApplyRemoteAnswer("have-remote-offer", null, answer)).toBe(false);
  });

  it("switches the shared video track without rebuilding the peer", async () => {
    const oldVideo = { kind: "video" } as MediaStreamTrack;
    const nextVideo = { kind: "video" } as MediaStreamTrack;
    const replaceTrack = vi.fn().mockResolvedValue(undefined);
    const setParameters = vi.fn().mockResolvedValue(undefined);
    const sender = {
      track: oldVideo,
      replaceTrack,
      getParameters: () => ({ encodings: [{}] }),
      setParameters,
    } as unknown as RTCRtpSender;
    const peer = {
      getSenders: () => [sender],
      addTrack: vi.fn(),
    } as unknown as RTCPeerConnection;
    const stream = { getTracks: () => [nextVideo] } as unknown as MediaStream;

    await expect(replacePeerTracks(peer, stream, 7_000_000)).resolves.toBe(false);
    expect(replaceTrack).toHaveBeenCalledWith(nextVideo);
    expect(setParameters).toHaveBeenCalledWith({ encodings: [{ maxBitrate: 7_000_000 }] });
    expect(peer.addTrack).not.toHaveBeenCalled();
  });

  it("stops every capture track when leaving a room", async () => {
    const transport = createTransport(() => new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ roomId }) => useRoomMediaCore({ roomId, transport }),
      { initialProps: { roomId: "room-a" as string | null } },
    );
    const videoTrack = { stop: vi.fn(), kind: "video" };
    const audioTrack = { stop: vi.fn(), kind: "audio" };
    const stream = { getTracks: () => [videoTrack, audioTrack] } as unknown as MediaStream;

    await act(() => result.current.startBroadcast(stream, {
      preset: "1080p60",
      width: 1920,
      height: 1080,
      frameRate: 60,
      hasAudio: true,
    }, 10_000_000));
    rerender({ roomId: null });

    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
  });

  it("ends polling and marks a room unavailable when it is closed", async () => {
    const poll = vi.fn().mockResolvedValue({
      events: [{
        id: "event-1",
        senderUserId: "owner",
        sentAt: Date.now(),
        cursor: 1,
        payload: { type: "room:closed" },
      }],
      onlineUserIds: ["owner"],
      activeStreams: [],
      cursor: 1,
    } satisfies RealtimePoll);
    const transport = createTransport(poll);
    const { result } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));

    await waitFor(() => expect(result.current.roomUnavailable).toBe(true));
    expect(poll).toHaveBeenCalledOnce();
  });

  it("uses the first poll as a cursor baseline instead of recreating stale peers", async () => {
    class PeerStub {
      static created = 0;
      connectionState: RTCPeerConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      constructor() { PeerStub.created += 1; }
      close() { this.connectionState = "closed"; }
    }
    vi.stubGlobal("RTCPeerConnection", PeerStub);
    const transport = createTransport(vi.fn().mockResolvedValue({
      events: [{
        id: "stale-candidate",
        senderUserId: "streamer",
        sentAt: Date.now() - 10_000,
        cursor: 41,
        payload: { type: "webrtc:ice-candidate", targetUserId: "viewer", mediaSessionId: "session-fixture-01", candidate: { candidate: "candidate" } },
      }],
      onlineUserIds: ["streamer", "viewer"],
      activeStreams: [],
      cursor: 41,
    } satisfies RealtimePoll));

    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));
    await waitFor(() => expect(result.current.connectionStatus).toBe("good"));

    expect(PeerStub.created).toBe(0);
    unmount();
  });

  it("buffers bounded early ICE without allocating peers for unknown sessions", async () => {
    vi.useFakeTimers();
    class PeerStub {
      static created = 0;
      connectionState: RTCPeerConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      constructor() { PeerStub.created += 1; }
      close() { this.connectionState = "closed"; }
    }
    vi.stubGlobal("RTCPeerConnection", PeerStub);
    const now = Date.now();
    const unsolicited = Array.from({ length: 40 }, (_, index) => ({
      id: `candidate-${index}`,
      senderUserId: "attacker",
      sentAt: now,
      cursor: index + 1,
      payload: {
        type: "webrtc:ice-candidate" as const,
        targetUserId: "viewer",
        mediaSessionId: `unknown-session-${String(index).padStart(2, "0")}`,
        candidate: { candidate: `candidate:${index}` },
      },
    }));
    const poll = vi.fn()
      .mockResolvedValueOnce({ events: [], onlineUserIds: ["viewer", "attacker"], activeStreams: [], cursor: 0 } satisfies RealtimePoll)
      .mockResolvedValueOnce({ events: unsolicited, onlineUserIds: ["viewer", "attacker"], activeStreams: [], cursor: 40 } satisfies RealtimePoll)
      .mockImplementation(() => new Promise(() => undefined));
    const transport = createTransport(poll);
    const { unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });

    expect(PeerStub.created).toBe(0);
    expect(poll).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("retries a watch request while signaling has not connected the peer", async () => {
    vi.useFakeTimers();
    class PeerStub {
      connectionState: RTCPeerConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      close() { this.connectionState = "closed"; }
    }
    vi.stubGlobal("RTCPeerConnection", PeerStub);
    const transport = createTransport(() => new Promise(() => undefined));
    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));

    await act(async () => {
      await result.current.watch("streamer");
    });
    expect(transport.send).toHaveBeenCalledWith("room-a", {
      type: "watch:request",
      targetUserId: "streamer",
      mediaSessionId: expect.any(String),
    });
    const watchRequest = vi.mocked(transport.send).mock.calls.map(([, payload]) => payload)
      .find((payload) => payload.type === "watch:request");
    expect(watchRequest).toMatchObject({ type: "watch:request", mediaSessionId: expect.any(String) });
    const mediaSessionId = watchRequest && "mediaSessionId" in watchRequest ? watchRequest.mediaSessionId : "";

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(transport.send).toHaveBeenCalledWith("room-a", {
      type: "watch:request",
      targetUserId: "streamer",
      mediaSessionId: expect.any(String),
    });
    expect(vi.mocked(transport.send).mock.calls.filter(([, payload]) => payload.type === "watch:request")).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(17_000);
    });
    expect(transport.send).toHaveBeenCalledWith("room-a", {
      type: "watch:stop",
      targetUserId: "streamer",
      mediaSessionId,
    });
    unmount();
  });

  it("does not poison polling when a retried negotiation delivers the same answer twice", async () => {
    vi.useFakeTimers();
    class PeerStub {
      static lastCreated: PeerStub | undefined;
      connectionState: RTCPeerConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      localDescription: RTCSessionDescription | null = null;
      remoteDescription: RTCSessionDescription | null = null;
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      private senders: RTCRtpSender[] = [];
      constructor() { PeerStub.lastCreated = this; }
      getSenders() { return this.senders; }
      addTrack() {
        const sender = {
          getParameters: () => ({ encodings: [{}] }),
          setParameters: vi.fn().mockResolvedValue(undefined),
        } as unknown as RTCRtpSender;
        this.senders.push(sender);
        return sender;
      }
      createOffer() { return Promise.resolve({ type: "offer" as const, sdp: "offer-sdp" }); }
      setLocalDescription(description: RTCSessionDescriptionInit) {
        this.localDescription = description as RTCSessionDescription;
        this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
        return Promise.resolve();
      }
      setRemoteDescription = vi.fn((description: RTCSessionDescriptionInit) => {
        if (description.type === "answer" && this.signalingState !== "have-local-offer") {
          return Promise.reject(new Error("InvalidStateError"));
        }
        this.remoteDescription = description as RTCSessionDescription;
        this.signalingState = "stable";
        return Promise.resolve();
      });
      addIceCandidate() { return Promise.resolve(); }
      close() { this.connectionState = "closed"; }
    }
    vi.stubGlobal("RTCPeerConnection", PeerStub);

    const answer = { type: "answer" as const, sdp: "answer-sdp" };
    const now = Date.now();
    const poll = vi.fn()
      .mockResolvedValueOnce({
        events: [],
        onlineUserIds: ["viewer", "broadcaster"],
        activeStreams: [],
        cursor: 0,
      } satisfies RealtimePoll)
      .mockResolvedValueOnce({
        events: [{
          id: "watch-1",
          senderUserId: "viewer",
          sentAt: now,
          cursor: 1,
          payload: { type: "watch:request", targetUserId: "broadcaster", mediaSessionId: "session-fixture-01" },
        }],
        onlineUserIds: ["viewer", "broadcaster"],
        activeStreams: [],
        cursor: 1,
      } satisfies RealtimePoll)
      .mockResolvedValueOnce({
        events: [1, 2].map((cursor) => ({
          id: `answer-${cursor}`,
          senderUserId: "viewer",
          sentAt: now,
          cursor,
          payload: { type: "webrtc:answer" as const, targetUserId: "broadcaster", mediaSessionId: "session-fixture-01", description: answer },
        })),
        onlineUserIds: ["viewer", "broadcaster"],
        activeStreams: [],
        cursor: 2,
      } satisfies RealtimePoll)
      .mockImplementation(() => new Promise(() => undefined));
    const transport = createTransport(poll);
    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));
    const stream = { getTracks: () => [{ kind: "video", stop: vi.fn() }] } as unknown as MediaStream;

    await act(async () => {
      await result.current.startBroadcast(stream, {
        preset: "1080p60",
        width: 1920,
        height: 1080,
        frameRate: 60,
        hasAudio: false,
      }, 10_000_000);
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(transport.send).toHaveBeenCalledWith("room-a", expect.objectContaining({
      type: "webrtc:offer",
      targetUserId: "viewer",
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(PeerStub.lastCreated?.setRemoteDescription).toHaveBeenCalledOnce();
    expect(PeerStub.lastCreated?.signalingState).toBe("stable");
    expect(result.current.connectionStatus).not.toBe("unstable");
    unmount();
  });

  it("keeps directional broadcast and watch lifecycles independent for the same remote user", async () => {
    vi.useFakeTimers();
    class PeerStub {
      static instances: PeerStub[] = [];
      connectionState: RTCPeerConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      localDescription: RTCSessionDescription | null = null;
      remoteDescription: RTCSessionDescription | null = null;
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      closed = false;
      private senders: RTCRtpSender[] = [];
      constructor() { PeerStub.instances.push(this); }
      getSenders() { return this.senders; }
      addTrack() {
        const sender = { getParameters: () => ({ encodings: [{}] }), setParameters: vi.fn().mockResolvedValue(undefined) } as unknown as RTCRtpSender;
        this.senders.push(sender);
        return sender;
      }
      createOffer() { return Promise.resolve({ type: "offer" as const, sdp: "offer-sdp" }); }
      setLocalDescription(description: RTCSessionDescriptionInit) { this.localDescription = description as RTCSessionDescription; this.signalingState = "have-local-offer"; return Promise.resolve(); }
      addIceCandidate() { return Promise.resolve(); }
      close() { this.closed = true; this.connectionState = "closed"; }
    }
    vi.stubGlobal("RTCPeerConnection", PeerStub);
    const now = Date.now();
    const poll = vi.fn()
      .mockResolvedValueOnce({ events: [], onlineUserIds: ["local", "friend"], activeStreams: [], cursor: 0 } satisfies RealtimePoll)
      .mockResolvedValueOnce({
        events: [{ id: "watch", senderUserId: "friend", sentAt: now, cursor: 1, payload: { type: "watch:request", targetUserId: "local", mediaSessionId: "outbound-session-01" } }],
        onlineUserIds: ["local", "friend"], activeStreams: [], cursor: 1,
      } satisfies RealtimePoll)
      .mockImplementation(() => new Promise(() => undefined));
    const transport = createTransport(poll);
    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ kind: "video", stop: stopTrack }] } as unknown as MediaStream;

    await act(async () => {
      await result.current.startBroadcast(stream, { preset: "1080p60", width: 1920, height: 1080, frameRate: 60, hasAudio: false }, 10_000_000);
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => { await result.current.watch("friend"); });

    expect(PeerStub.instances).toHaveLength(2);
    expect(PeerStub.instances[0]?.getSenders()).toHaveLength(1);
    expect(PeerStub.instances[1]?.getSenders()).toHaveLength(0);
    await act(async () => { await result.current.stopWatching("friend"); });
    expect(PeerStub.instances[0]?.closed).toBe(false);
    expect(PeerStub.instances[1]?.closed).toBe(true);
    expect(stopTrack).not.toHaveBeenCalled();

    await act(async () => { await result.current.watch("friend"); });
    expect(PeerStub.instances).toHaveLength(3);
    await act(async () => { await result.current.stopBroadcast(); });
    expect(PeerStub.instances[0]?.closed).toBe(true);
    expect(PeerStub.instances[2]?.closed).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
    unmount();
  });

  it("keeps a stream through one transient empty snapshot, then expires it after a bounded grace", async () => {
    vi.useFakeTimers();
    const activeStream = { streamerUserId: "friend", preset: "1080p60" as const, width: 1920, height: 1080, frameRate: 60, hasAudio: true, startedAt: Date.now() };
    const poll = vi.fn()
      .mockResolvedValueOnce({ events: [], onlineUserIds: ["friend"], activeStreams: [activeStream], cursor: 0 } satisfies RealtimePoll)
      .mockResolvedValueOnce({ events: [], onlineUserIds: [], activeStreams: [], cursor: 0 } satisfies RealtimePoll)
      .mockImplementation(() => new Promise(() => undefined));
    const transport = createTransport(poll);
    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.activeStreams).toEqual([activeStream]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(result.current.activeStreams).toEqual([activeStream]);
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(result.current.activeStreams).toEqual([]);
    unmount();
  });

  it("treats an explicit stream stop as immediate even during snapshot recovery grace", async () => {
    vi.useFakeTimers();
    const activeStream = { streamerUserId: "friend", preset: "1080p60" as const, width: 1920, height: 1080, frameRate: 60, hasAudio: false, startedAt: Date.now() };
    const poll = vi.fn()
      .mockResolvedValueOnce({ events: [], onlineUserIds: ["friend"], activeStreams: [activeStream], cursor: 0 } satisfies RealtimePoll)
      .mockResolvedValueOnce({
        events: [{ id: "stop", senderUserId: "friend", sentAt: Date.now(), cursor: 1, payload: { type: "stream:stop" } }],
        onlineUserIds: ["friend"], activeStreams: [], cursor: 1,
      } satisfies RealtimePoll)
      .mockImplementation(() => new Promise(() => undefined));
    const transport = createTransport(poll);
    const { result, unmount } = renderHook(() => useRoomMediaCore({ roomId: "room-a", transport }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.activeStreams).toEqual([activeStream]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(result.current.activeStreams).toEqual([]);
    unmount();
  });
});
