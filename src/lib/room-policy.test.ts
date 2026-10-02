import { describe, expect, it } from "vitest";
import {
  assertRoomAccess,
  canAutoJoinInvite,
  canManageRoom,
  canSignalToMember,
  isAuthorizedMember,
  isRoomActive,
} from "./room-policy";

const owner = { role: "OWNER" as const, revokedAt: null };
const member = { role: "MEMBER" as const, revokedAt: null };

describe("room authorization", () => {
  it("keeps membership independent from presence", () => {
    expect(isAuthorizedMember(member)).toBe(true);
  });

  it("grants management only to an active owner", () => {
    expect(canManageRoom(owner)).toBe(true);
    expect(canManageRoom(member)).toBe(false);
    expect(canManageRoom({ ...owner, revokedAt: new Date() })).toBe(false);
  });

  it("rejects closed and expired rooms", () => {
    expect(isRoomActive({ closedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) })).toBe(false);
    expect(isRoomActive({ closedAt: null, expiresAt: new Date(Date.now() - 1) })).toBe(false);
    expect(() => assertRoomAccess({ closedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }, owner)).toThrow("ROOM_UNAVAILABLE");
  });

  it("rejects revoked users and signaling to outsiders", () => {
    const revoked = { ...member, revokedAt: new Date() };
    expect(() => assertRoomAccess({ closedAt: null, expiresAt: new Date(Date.now() + 60_000) }, revoked)).toThrow("ROOM_FORBIDDEN");
    expect(canSignalToMember(member, member)).toBe(true);
    expect(canSignalToMember(member, revoked)).toBe(false);
  });

  it("never restores a revoked membership by reusing an invitation", () => {
    expect(canAutoJoinInvite(undefined, "INVITE", true)).toBe(true);
    expect(canAutoJoinInvite({ ...member, revokedAt: new Date() }, "INVITE", true)).toBe(false);
    expect(canAutoJoinInvite(member, "INVITE", true)).toBe(false);
    expect(canAutoJoinInvite(undefined, "APPROVAL", true)).toBe(false);
    expect(canAutoJoinInvite(undefined, "INVITE", false)).toBe(false);
  });
});
