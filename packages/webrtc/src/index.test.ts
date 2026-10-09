// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReconnectDelay,
  getPeerConnectionStatus,
  getRoomPollInterval,
  getRoomSignalDirective,
  shouldApplyRemoteAnswer,
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

  it("closes only the sender peer when watching or streaming stops", () => {
    expect(getRoomSignalDirective({ type: "watch:stop", targetUserId: "user" })).toEqual({
      closeSender: true,
      membershipChanged: false,
      roomUnavailable: false,
    });
    expect(getRoomSignalDirective({ type: "stream:stop" }).closeSender).toBe(true);
  });

  it("caps reconnect backoff without creating a hot retry loop", () => {
    expect(getReconnectDelay(1)).toBe(2_000);
    expect(getReconnectDelay(2)).toBe(4_000);
    expect(getReconnectDelay(20)).toBe(12_000);
  });

  it("does not report a media connection as good while its peer is still connecting", () => {
    expect(getPeerConnectionStatus([])).toBe("good");
    expect(getPeerConnectionStatus(["new", "connecting"])).toBe("reconnecting");
    expect(getPeerConnectionStatus(["disconnected"])).toBe("unstable");
    expect(getPeerConnectionStatus(["connected"])).toBe("good");
  });

  it("polls faster only while negotiating a peer connection", () => {
    expect(getRoomPollInterval([])).toBe(1_500);
    expect(getRoomPollInterval(["new"])).toBe(300);
    expect(getRoomPollInterval(["connecting"])).toBe(300);
    expect(getRoomPollInterval(["connected"])).toBe(1_500);
  });

  it("applies an answer once and ignores repeated or stale answers", () => {
    const answer = { type: "answer" as const, sdp: "v=0\r\n" };
    expect(shouldApplyRemoteAnswer("have-local-offer", null, answer)).toBe(true);
    expect(shouldApplyRemoteAnswer("stable", answer as RTCSessionDescription, answer)).toBe(false);
    expect(shouldApplyRemoteAnswer("have-remote-offer", null, answer)).toBe(false);
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
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(transport.send).toHaveBeenCalledWith("room-a", {
      type: "watch:request",
      targetUserId: "streamer",
    });
    expect(vi.mocked(transport.send).mock.calls.filter(([, payload]) => payload.type === "watch:request")).toHaveLength(2);
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
        events: [{
          id: "watch-1",
          senderUserId: "viewer",
          sentAt: now,
          cursor: 1,
          payload: { type: "watch:request", targetUserId: "broadcaster" },
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
          payload: { type: "webrtc:answer" as const, targetUserId: "broadcaster", description: answer },
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
      await vi.advanceTimersByTimeAsync(0);
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
});
