import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  activeRevocationCutoff,
  applyRevocationTransition,
  authorizeMediaSignal,
  consumeSignalBudget,
  hasUserSignalBudget,
  isTokenRevoked,
  MAX_MEDIA_SESSIONS_PER_CONNECTION,
  MAX_SIGNALS_PER_WINDOW,
  removeBroadcastSessions,
  resolveLegacyMediaSessionId,
  stripMediaSessionIdForLegacy,
  type SignalingConnectionState,
} from "./connection-policy";

function connection(userId: string, protocol: "janjalive-v1" | "janjalive-v2" = "janjalive-v2"): SignalingConnectionState {
  return { userId, protocol, mediaSessions: [], signalWindowStartedAt: 1_000, signalCount: 0 };
}

describe("realtime connection policy", () => {
  it("rejects a token issued at or before the durable revocation cutoff", () => {
    expect(isTokenRevoked(100, 100)).toBe(true);
    expect(isTokenRevoked(99, 100)).toBe(true);
    expect(isTokenRevoked(101, 100)).toBe(false);
    expect(isTokenRevoked(100, undefined)).toBe(false);
  });

  it("keeps the newest revocation transition when events arrive out of order", () => {
    const banned = applyRevocationTransition(undefined, "REVOKE", 2_000);
    const staleUnban = applyRevocationTransition(banned, "RESTORE", 1_000);
    expect(staleUnban).toEqual(banned);
    expect(activeRevocationCutoff(staleUnban)).toBe(2);

    const restored = applyRevocationTransition(banned, "RESTORE", 3_000);
    expect(restored).toEqual({ changedAt: 3_000, revoked: false });
    expect(activeRevocationCutoff(restored)).toBeUndefined();

    const sameMillisecondBan = applyRevocationTransition(restored, "REVOKE", 3_000);
    expect(sameMillisecondBan).toEqual({ changedAt: 3_000, revoked: true, revokedAt: 3 });
  });

  it("keeps a stale realtime token blocked by the account cutoff after membership restoration", () => {
    const membershipRestored = applyRevocationTransition(
      applyRevocationTransition(undefined, "REVOKE", 1_000),
      "RESTORE",
      3_000,
    );
    const accountBanned = applyRevocationTransition(undefined, "REVOKE", 2_000);
    const cutoff = Math.max(
      activeRevocationCutoff(membershipRestored) ?? -1,
      activeRevocationCutoff(accountBanned) ?? -1,
    );
    expect(isTokenRevoked(1, cutoff)).toBe(true);
  });

  it("bounds signaling messages inside a persisted connection window", () => {
    const state = connection("viewer");
    for (let index = 0; index < MAX_SIGNALS_PER_WINDOW; index += 1) {
      expect(consumeSignalBudget(state, 1_100)).toBe(true);
    }
    expect(consumeSignalBudget(state, 1_100)).toBe(false);
    expect(consumeSignalBudget(state, 11_000)).toBe(true);
  });

  it("shares the signaling budget across sockets for the same user", () => {
    const first = connection("viewer");
    const second = connection("viewer");
    first.signalCount = 200;
    second.signalCount = 100;
    expect(hasUserSignalBudget([first, second], "viewer", 1_100)).toBe(false);
    expect(hasUserSignalBudget([first, second], "other", 1_100)).toBe(true);
    expect(hasUserSignalBudget([first, second], "viewer", 11_000)).toBe(true);
  });

  it("requires a bounded watch session before accepting peer negotiation", () => {
    const viewer = connection("viewer");
    const broadcaster = connection("broadcaster");
    const states = [viewer, broadcaster];

    expect(authorizeMediaSignal(states, broadcaster, {
      type: "webrtc:offer",
      targetUserId: "viewer",
      mediaSessionId: "session-security-01",
      description: { type: "offer", sdp: "sdp" },
    })).toBe(false);

    for (let index = 0; index < MAX_MEDIA_SESSIONS_PER_CONNECTION; index += 1) {
      expect(authorizeMediaSignal(states, viewer, {
        type: "watch:request",
        targetUserId: "broadcaster",
        mediaSessionId: `session-security-${index}`,
      })).toBe(true);
    }
    expect(authorizeMediaSignal(states, viewer, {
      type: "watch:request",
      targetUserId: "broadcaster",
      mediaSessionId: "session-security-overflow",
    })).toBe(false);
  });

  it("releases every viewer slot when the broadcaster stops", () => {
    const viewer = connection("viewer");
    const broadcaster = connection("broadcaster");
    for (let index = 0; index < MAX_MEDIA_SESSIONS_PER_CONNECTION; index += 1) {
      expect(authorizeMediaSignal([viewer, broadcaster], viewer, {
        type: "watch:request",
        targetUserId: "broadcaster",
        mediaSessionId: `session-release-${index}`,
      })).toBe(true);
    }
    removeBroadcastSessions(viewer, "broadcaster");
    expect(authorizeMediaSignal([viewer, broadcaster], viewer, {
      type: "watch:request",
      targetUserId: "broadcaster",
      mediaSessionId: "session-release-next",
    })).toBe(true);
  });

  it("translates pair-scoped legacy replies and strips v2 IDs for v1 recipients", () => {
    const viewer = connection("viewer", "janjalive-v2");
    const broadcaster = connection("broadcaster", "janjalive-v1");
    viewer.mediaSessions.push({ id: "current-session-01", broadcasterUserId: "broadcaster" });
    const offer = resolveLegacyMediaSessionId([viewer, broadcaster], broadcaster, {
      type: "webrtc:offer",
      targetUserId: "viewer",
      mediaSessionId: "legacy_pair_session",
      description: { type: "offer", sdp: "sdp" },
    });
    expect(offer).toMatchObject({ mediaSessionId: "current-session-01" });
    const legacyOffer = stripMediaSessionIdForLegacy(offer);
    expect(legacyOffer).not.toHaveProperty("mediaSessionId");
    const releasedClientOfferSchema = z.object({
      type: z.literal("webrtc:offer"),
      targetUserId: z.string(),
      description: z.object({ type: z.literal("offer"), sdp: z.string() }).strict(),
    }).strict();
    expect(releasedClientOfferSchema.safeParse(legacyOffer).success).toBe(true);
  });
});
