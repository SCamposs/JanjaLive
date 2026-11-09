import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), publishSignal: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./realtime", () => ({ publishSignal: mocks.publishSignal, hasActiveRoomPresence: vi.fn() }));
import { deleteRoom } from "./rooms";

function fixture(ownerId = "owner", closedAt: Date | null = null) {
  const operations: string[] = [];
  const row = { ownerId, closedAt };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
    update: vi.fn(() => ({ set: () => ({ where: async () => { row.closedAt = new Date(); operations.push("close"); } }) })),
    delete: vi.fn(() => ({ where: async () => { operations.push("delete"); } })),
  };
  mocks.getDb.mockReturnValue(db);
  mocks.publishSignal.mockImplementation(async () => { operations.push("disconnect"); });
  return { db, row, operations };
}
beforeEach(() => vi.resetAllMocks());
describe("room deletion lifecycle", () => {
  it("seals the provider before destroying membership identifiers", async () => {
    const data = fixture();
    await deleteRoom("room", "owner");
    expect(data.operations).toEqual(["close", "disconnect", "delete"]);
    expect(mocks.publishSignal).toHaveBeenCalledWith("room", "owner", { type: "room:closed" });
  });
  it("retains a closed room on provider failure and allows its owner to retry", async () => {
    const data = fixture();
    mocks.publishSignal.mockRejectedValueOnce(new Error("offline"));
    await expect(deleteRoom("room", "owner")).rejects.toThrow("offline");
    expect(data.row.closedAt).not.toBeNull();
    expect(data.db.delete).not.toHaveBeenCalled();
    await deleteRoom("room", "owner");
    expect(data.db.update).toHaveBeenCalledOnce();
    expect(data.db.delete).toHaveBeenCalledOnce();
  });
  it("never publishes closure for another user's room", async () => {
    const data = fixture();
    await expect(deleteRoom("room", "outsider")).rejects.toThrow("OWNER_REQUIRED");
    expect(data.db.update).not.toHaveBeenCalled();
    expect(mocks.publishSignal).not.toHaveBeenCalled();
  });
});
