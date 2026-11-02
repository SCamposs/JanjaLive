import { describe, expect, it } from "vitest";
import { activeRevocationCutoffMs, hasConnectionCapacity, isTokenRevoked, MAX_SOCKETS_PER_ROOM, MAX_SOCKETS_PER_USER_PER_ROOM } from "./connection-policy";

describe("room connection admission", () => {
  it("allows multiple devices but rejects a fourth connection for one user", () => {
    const states = Array.from({ length: MAX_SOCKETS_PER_USER_PER_ROOM }, () => ({ userId: "same-user" }));
    expect(hasConnectionCapacity(states, "same-user")).toBe(false);
    expect(hasConnectionCapacity(states, "another-user")).toBe(true);
  });
  it("rejects every new socket once the room reaches its total limit", () => {
    const states = Array.from({ length: MAX_SOCKETS_PER_ROOM }, (_, index) => ({ userId: `user-${index}` }));
    expect(hasConnectionCapacity(states, "new-user")).toBe(false);
    expect(hasConnectionCapacity(states.slice(1), "new-user")).toBe(true);
  });

  it("keeps old credentials revoked but allows a new login in the same second", () => {
    const cutoff = activeRevocationCutoffMs({ changedAt: 1_700_000_000_500, revoked: true });
    expect(isTokenRevoked(1_700_000_000_499, cutoff)).toBe(true);
    expect(isTokenRevoked(1_700_000_000_500, cutoff)).toBe(true);
    expect(isTokenRevoked(1_700_000_000_501, cutoff)).toBe(false);
    expect(activeRevocationCutoffMs(1_700_000_000)).toBe(1_700_000_000_000);
  });
});
