import { describe, expect, it } from "vitest";
import { createRoomSchema, signalEnvelopeSchema, signalingEventSchema } from "./schemas";

describe("boundary schemas", () => {
  it("uses approval as the safe room default", () => {
    expect(createRoomSchema.parse({})).toEqual({ accessMode: "APPROVAL" });
  });

  it("keeps room expiration under server control", () => {
    expect(createRoomSchema.safeParse({ expiresInHours: 168 }).success).toBe(false);
  });

  it("accepts a valid stream announcement", () => {
    expect(signalingEventSchema.safeParse({
      type: "stream:start",
      metadata: { preset: "1080p60", width: 1920, height: 1080, frameRate: 60, hasAudio: true },
    }).success).toBe(true);
  });

  it("requires a target for peer negotiation", () => {
    expect(signalingEventSchema.safeParse({ type: "webrtc:offer", description: { type: "offer", sdp: "v=0" } }).success).toBe(false);
  });

  it("rejects unbounded SDP payloads", () => {
    expect(signalingEventSchema.safeParse({
      type: "webrtc:offer",
      targetUserId: "user",
      description: { type: "offer", sdp: "x".repeat(150_001) },
    }).success).toBe(false);
  });

  it("prevents clients from forging room lifecycle events", () => {
    expect(signalEnvelopeSchema.safeParse({ roomId: crypto.randomUUID(), type: "room:closed" }).success).toBe(false);
    expect(signalEnvelopeSchema.safeParse({
      roomId: crypto.randomUUID(),
      type: "room:revoked",
      targetUserId: "another-user",
    }).success).toBe(false);
  });
});
