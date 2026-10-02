import { describe, expect, it } from "vitest";
import { createInviteToken, createRoomCode, hashInviteToken, safeEqual } from "./crypto";

describe("invite security", () => {
  it("creates high-entropy opaque invite tokens", () => {
    const token = createInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).not.toBe(createInviteToken());
  });

  it("compares fixed hashes without exposing the raw invite", () => {
    const hash = hashInviteToken("secret-invite");
    expect(safeEqual(hash, hashInviteToken("secret-invite"))).toBe(true);
    expect(safeEqual(hash, hashInviteToken("other"))).toBe(false);
  });

  it("creates a human-friendly code that excludes ambiguous characters", () => {
    expect(createRoomCode()).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
  });
});
