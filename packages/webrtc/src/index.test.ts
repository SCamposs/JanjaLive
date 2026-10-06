// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReconnectDelay,
  getPeerConnectionStatus,
  getRoomSignalDirective,
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
});
