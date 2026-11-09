import { afterEach, expect, it, vi } from "vitest";
import { createShareableInvite, shareableInviteRoomId, verifyShareableInvite } from "./shareable-invite";

const room = { publicId: "public-id-12345678", inviteHash: "stored-random-invite-hash" };
afterEach(() => vi.unstubAllEnvs());
it("creates a stable scoped invite without revealing the stored hash", () => {
  vi.stubEnv("AUTH_SECRET", "test-only-key-that-is-not-a-production-secret");
  const token = createShareableInvite(room);
  expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
  expect(shareableInviteRoomId(token)).toBe(room.publicId);
  expect(verifyShareableInvite(token, room)).toBe(true);
  expect(token).not.toContain(room.inviteHash);
  expect(verifyShareableInvite(token, { ...room, inviteHash: "rotated" })).toBe(false);
  expect(verifyShareableInvite(token, { ...room, publicId: "other-id-1234567890" })).toBe(false);
  expect(verifyShareableInvite(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), room)).toBe(false);
});
it("does not reinterpret legacy random tokens as shareable tokens", () => {
  expect(shareableInviteRoomId("s1_" + "a".repeat(40))).toBeNull();
  expect(shareableInviteRoomId("a".repeat(43))).toBeNull();
});
