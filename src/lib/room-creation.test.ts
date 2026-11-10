import { drizzle } from "drizzle-orm/neon-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const mocks = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => Object.assign(drizzle.mock({ schema }), { batch: mocks.batch }) }));
import { createRoom } from "./rooms";

describe("room creation failure reasons", () => {
  beforeEach(() => {
    mocks.batch.mockReset();
    vi.unstubAllEnvs();
  });

  it.each([
    [{ account_status: "ACTIVE", active_rooms: 5, room_creation_count: 5 }, "ACTIVE_ROOM_LIMIT_REACHED"],
    [{ account_status: "ACTIVE", active_rooms: 0, room_creation_count: 20 }, "DAILY_ROOM_LIMIT_REACHED"],
    [{ account_status: "BANNED", active_rooms: 5, room_creation_count: 20 }, "ACCOUNT_DISABLED"],
  ])("reports the locked account policy without confusing account restrictions and quotas", async (policy, error) => {
    mocks.batch.mockResolvedValue([{}, { rows: [{ ...policy, room_creation_window_at: new Date().toISOString() }] }, { rows: [] }]);
    await expect(createRoom({ userId: "owner", accessMode: "APPROVAL" })).rejects.toThrow(error);
  });

  it("does not reject the twentieth successful creation when the counter reaches its limit", async () => {
    mocks.batch.mockResolvedValue([{}, { rows: [{ account_status: "ACTIVE", active_rooms: 4, room_creation_count: 19 }] }, { rows: [{ id: "new-room" }] }]);
    await expect(createRoom({ userId: "owner", accessMode: "APPROVAL" })).resolves.toHaveProperty("inviteToken");
  });
});
