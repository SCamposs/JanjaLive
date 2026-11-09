import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
import { leaveRoom } from "./rooms";

function fixture(member: { role: "OWNER" | "MEMBER"; revokedAt: Date | null } | null, timestamp = new Date("2026-11-02T12:00:00Z")) {
  const selectWhere = vi.fn(() => ({ limit: vi.fn().mockResolvedValue(member ? [member] : []) }));
  const where = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ revokedAt: timestamp }]) });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn(() => ({ set }));
  const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) })), update, delete: vi.fn() };
  mocks.getDb.mockReturnValue(db);
  return { db, selectWhere, where, set, timestamp };
}
beforeEach(() => vi.resetAllMocks());
describe("leaveRoom authorization and persistence", () => {
  it("revokes only the current membership and keeps the record for invite protection", async () => {
    const data = fixture({ role: "MEMBER", revokedAt: null });
    expect(await leaveRoom("room-id", "current-user")).toBe(data.timestamp.getTime());
    const query = new PgDialect().sqlToQuery(data.where.mock.calls[0][0] as SQL);
    expect(query.params).toEqual(["room-id", "current-user", "MEMBER"]);
    expect(data.db.delete).not.toHaveBeenCalled();
  });
  it.each([null, { role: "OWNER" as const, revokedAt: null }])("does not let an outsider or owner revoke ownership: %j", async (member) => {
    const data = fixture(member);
    await expect(leaveRoom("room-id", "current-user")).rejects.toThrow(member ? "OWNER_IMMUTABLE" : "ROOM_FORBIDDEN");
    expect(data.db.update).not.toHaveBeenCalled();
  });
  it("preserves the existing revocation timestamp when a request is retried", async () => {
    const timestamp = new Date("2026-11-02T12:00:00Z");
    const data = fixture({ role: "MEMBER", revokedAt: timestamp }, timestamp);
    expect(await leaveRoom("room-id", "current-user")).toBe(timestamp.getTime());
    const query = new PgDialect().sqlToQuery(data.set.mock.calls[0][0].revokedAt as SQL);
    expect(query.sql).toContain('coalesce("room_members"."revoked_at",');
  });
});
