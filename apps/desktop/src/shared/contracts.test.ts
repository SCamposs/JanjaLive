import { describe, expect, it } from "vitest";
import { parseRealtimePoll } from "./contracts";

const validEvent = {
  id: "event-1",
  roomId: "600d84a1-26a0-4758-8d81-14f8bbef08e2",
  senderUserId: "friend",
  sentAt: 1_000,
  cursor: 1_000_001,
  payload: { type: "watch:request", targetUserId: "viewer", mediaSessionId: "desktop-session-01" },
};

const normalizedEvent = {
  id: validEvent.id,
  senderUserId: validEvent.senderUserId,
  sentAt: validEvent.sentAt,
  cursor: validEvent.cursor,
  payload: validEvent.payload,
};

const validStream = {
  streamerUserId: "friend",
  preset: "1080p60",
  width: 1920,
  height: 1080,
  frameRate: 60,
  hasAudio: true,
  startedAt: 1_000,
};

describe("desktop realtime response boundary", () => {
  it("keeps a fully valid polling response", () => {
    const value = {
      events: [validEvent],
      onlineUserIds: ["friend"],
      activeStreams: [validStream],
      cursor: validEvent.cursor,
    };

    expect(parseRealtimePoll(value)).toEqual({
      ...value,
      events: [normalizedEvent],
    });
  });

  it("drops malformed retained entries without poisoning the next cursor", () => {
    const parsed = parseRealtimePoll({
      events: [
        validEvent,
        { ...validEvent, id: "broken", payload: { type: "unknown" } },
      ],
      onlineUserIds: ["friend", null],
      activeStreams: [validStream, { ...validStream, frameRate: "60" }],
      cursor: 1_000_999,
    });

    expect(parsed).toEqual({
      events: [normalizedEvent],
      onlineUserIds: ["friend"],
      activeStreams: [validStream],
      cursor: 1_000_999,
    });
  });

  it("still rejects an invalid envelope or cursor", () => {
    expect(() => parseRealtimePoll({ events: "invalid", onlineUserIds: [], activeStreams: [], cursor: 0 })).toThrow();
    expect(() => parseRealtimePoll({ events: [], onlineUserIds: [], activeStreams: [], cursor: -1 })).toThrow();
  });
});
