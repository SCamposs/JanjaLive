import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), setRealtimeAccountAccess: vi.fn(), revokeUserTurnCredentials: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./realtime", () => ({ setRealtimeAccountAccess: mocks.setRealtimeAccountAccess }));
vi.mock("./turn", () => ({ revokeUserTurnCredentials: mocks.revokeUserTurnCredentials }));
import { disconnectUserSessions, revokeAllUserSessions } from "./user-sessions";

function database() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn<(value: Record<string, unknown>) => { where: typeof where }>(() => ({ where }));
  const db = {
    batch: vi.fn().mockResolvedValue([]),
    update: vi.fn(() => ({ set })),
    delete: vi.fn(() => ({ where })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ roomId: "room-a" }, { roomId: "room-b" }]) })) })) })),
  };
  return { db, set };
}

describe("session revocation lifecycle", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("persists the cutoff before remote revocation and clears pending only after every transport succeeds", async () => {
    const { db, set } = database();
    mocks.getDb.mockReturnValue(db);
    await revokeAllUserSessions("user");
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.delete).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[0][0]).toMatchObject({ sessionDisconnectPending: true, sessionsRevokedAt: expect.any(Date) });
    expect(set.mock.calls.at(-1)?.[0]).toEqual({ sessionDisconnectPending: false });
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledTimes(2);
    expect(mocks.revokeUserTurnCredentials).toHaveBeenCalledWith("user", expect.any(Date));
    expect(db.batch.mock.invocationCallOrder[0]).toBeLessThan(mocks.revokeUserTurnCredentials.mock.invocationCallOrder[0]);
  });

  it("preserves pending work and still attempts every socket when TURN is unavailable", async () => {
    const { db, set } = database();
    mocks.getDb.mockReturnValue(db);
    mocks.revokeUserTurnCredentials.mockRejectedValue(new Error("provider unavailable"));
    await expect(revokeAllUserSessions("user")).rejects.toThrow("ACCESS_REVOCATION_INCOMPLETE");
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.some(([value]) => value.sessionDisconnectPending === false)).toBe(false);
  });

  it("retries with the original cutoff so newly issued credentials are preserved", async () => {
    const { db } = database();
    mocks.getDb.mockReturnValue(db);
    const cutoff = new Date("2026-10-26T12:00:00.500Z");
    await disconnectUserSessions("user", cutoff);
    expect(mocks.revokeUserTurnCredentials).toHaveBeenCalledWith("user", cutoff);
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: "user", changedAt: cutoff.getTime() }));
  });
});
