import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getDbMock } = vi.hoisted(() => ({ authMock: vi.fn(), getDbMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ getDb: getDbMock }));

import { requireAdmin } from "./admin";

function databaseReturning(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ limit: () => Promise.resolve(rows) }),
        }),
      }),
    }),
  };
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_USER_ID = "internal-owner";
    process.env.ADMIN_DISCORD_USER_ID = "discord-owner";
  });

  it("returns a not-found boundary for unauthenticated and ordinary users", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    authMock.mockResolvedValueOnce({ user: { id: "ordinary-user" } });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("requires the linked Discord provider ID in addition to the internal ID", async () => {
    authMock.mockResolvedValue({ user: { id: "internal-owner" } });
    getDbMock.mockReturnValue(databaseReturning([{ id: "internal-owner", discordId: null, providerDiscordId: "other", accountStatus: "ACTIVE" }]));
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("accepts only the active configured owner", async () => {
    authMock.mockResolvedValue({ user: { id: "internal-owner" } });
    const owner = { id: "internal-owner", discordId: null, providerDiscordId: "discord-owner", accountStatus: "ACTIVE" };
    getDbMock.mockReturnValue(databaseReturning([owner]));
    await expect(requireAdmin()).resolves.toEqual(owner);
  });
});
