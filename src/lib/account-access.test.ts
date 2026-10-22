import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), setRealtimeAccountAccess: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./realtime", () => ({ setRealtimeAccountAccess: mocks.setRealtimeAccountAccess }));

import { setUserAccess } from "./account-access";

function fakeDb(status: "ACTIVE" | "BANNED", roomIds = ["11111111-1111-4111-8111-111111111111"]) {
  let selectCount = 0;
  const batch = vi.fn().mockResolvedValue([]);
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }));
  const remove = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const insert = vi.fn(() => ({ values: vi.fn(() => ({ kind: "insert" })) }));
  const select = vi.fn(() => {
    selectCount += 1;
    if (selectCount === 1) {
      return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: "target", accountStatus: status }]) })) })) };
    }
    return {
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue(roomIds.map((roomId) => ({ roomId }))) })),
      })),
    };
  });
  return { db: { select, update, insert, delete: remove, batch }, batch, update, remove };
}

describe("setUserAccess", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_ID = "owner";
    process.env.ADMIN_DISCORD_USER_ID = "discord-owner";
    mocks.getDb.mockReset();
    mocks.setRealtimeAccountAccess.mockReset();
  });

  it("persists a new ban, revokes desktop sessions, and closes every active realtime socket", async () => {
    const { db, batch, update, remove } = fakeDb("ACTIVE", ["room-a", "room-b"]);
    mocks.getDb.mockReturnValue(db);

    await expect(setUserAccess({ actorUserId: "owner", targetUserId: "target", action: "BAN" })).resolves.toEqual({ changed: true });

    expect(batch).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledTimes(2);
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-a",
      senderUserId: "owner",
      targetUserId: "target",
      action: "BAN",
    }));
  });

  it("retries revocation for an already banned account without duplicating its audit entry", async () => {
    const { db, batch, update, remove } = fakeDb("BANNED", ["room-a"]);
    mocks.getDb.mockReturnValue(db);

    await expect(setUserAccess({ actorUserId: "owner", targetUserId: "target", action: "BAN" })).resolves.toEqual({ changed: false });

    expect(batch).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledOnce();
  });

  it("unbans without desktop revocation and clears durable realtime revocation", async () => {
    const { db, batch, update, remove } = fakeDb("BANNED");
    mocks.getDb.mockReturnValue(db);

    await expect(setUserAccess({ actorUserId: "owner", targetUserId: "target", action: "UNBAN" })).resolves.toEqual({ changed: true });

    expect(batch).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.setRealtimeAccountAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: "UNBAN",
      roomId: "11111111-1111-4111-8111-111111111111",
      targetUserId: "target",
    }));
  });
});
