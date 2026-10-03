import { describe, expect, it } from "vitest";
import type { ClientSignal, RealtimePoll } from "@janjalive/webrtc";
import { clientSignalSchema as desktopClientSignalSchema, realtimePollSchema } from "../../apps/desktop/src/shared/contracts";
import { clientSignalingEventSchema, signalingEventSchema } from "./schemas";

const signals = [
  { type: "presence:join" },
  { type: "presence:leave" },
  {
    type: "stream:start",
    metadata: { preset: "1080p60", width: 1920, height: 1080, frameRate: 60, hasAudio: true },
  },
  { type: "stream:stop" },
  { type: "watch:request", targetUserId: "friend" },
  { type: "watch:stop", targetUserId: "friend" },
  {
    type: "webrtc:offer",
    targetUserId: "friend",
    description: { type: "offer", sdp: "v=0" },
  },
  {
    type: "webrtc:answer",
    targetUserId: "friend",
    description: { type: "answer", sdp: "v=0" },
  },
  {
    type: "webrtc:ice-candidate",
    targetUserId: "friend",
    candidate: { candidate: "candidate:fixture", sdpMid: "0", sdpMLineIndex: 0 },
  },
] satisfies ClientSignal[];

describe("web and desktop realtime contract", () => {
  it.each(signals)("accepts $type with both runtime validators", (signal) => {
    expect(clientSignalingEventSchema.safeParse(signal).success).toBe(true);
    expect(desktopClientSignalSchema.safeParse(signal).success).toBe(true);
  });

  it("accepts the same poll envelope consumed by the shared WebRTC core", () => {
    const poll = {
      events: [{
        id: "event-1",
        senderUserId: "friend",
        sentAt: Date.now(),
        cursor: 1,
        payload: { type: "room:closed" },
      }],
      onlineUserIds: ["friend"],
      activeStreams: [{
        streamerUserId: "friend",
        preset: "1080p60",
        width: 1920,
        height: 1080,
        frameRate: 60,
        hasAudio: true,
        startedAt: Date.now(),
      }],
      cursor: 1,
    } satisfies RealtimePoll;

    expect(realtimePollSchema.safeParse(poll).success).toBe(true);
    expect(poll.events.every((event) => signalingEventSchema.safeParse(event.payload).success)).toBe(true);
  });
});
