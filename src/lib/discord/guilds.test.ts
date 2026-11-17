import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), request: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select: mocks.select, insert: mocks.insert }) }));
vi.mock("./api", () => ({ discordRequest: mocks.request }));
import { assertGuildAdmission } from "./guilds";
const guild = "100000000000000080";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
  mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ blocked: false }] }) }) });
  mocks.request.mockResolvedValue({ id: guild, name: "Meu servidor" });
});
afterEach(() => vi.unstubAllEnvs());
it("automatically registers a verified official-bot installation without an allowlist", async () => {
  await expect(assertGuildAdmission(guild)).resolves.toBeUndefined();
  expect(mocks.request).toHaveBeenCalledWith(`/guilds/${guild}`);
  expect(mocks.insert).toHaveBeenCalled();
});
it("refuses a blocked guild before contacting Discord", async () => {
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ blocked: true }] }) }) });
  await expect(assertGuildAdmission(guild)).rejects.toThrow("DISCORD_GUILD_BLOCKED");
  expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it("refuses unavailable installations and never registers unverified metadata", async () => {
  mocks.request.mockRejectedValueOnce(new Error("DISCORD_PERMISSION"));
  await expect(assertGuildAdmission(guild)).rejects.toThrow("DISCORD_PERMISSION");
  mocks.request.mockResolvedValueOnce({ id: "100000000000000081", name: "Outro servidor" });
  await expect(assertGuildAdmission(guild)).rejects.toThrow("DISCORD_UNAVAILABLE");
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("cannot clear a block that races the installation verification", async () => {
  mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ blocked: true }] }) }) });
  await expect(assertGuildAdmission(guild)).rejects.toThrow("DISCORD_GUILD_BLOCKED");
});
it("fails closed with the feature disabled or a malformed guild", async () => {
  await expect(assertGuildAdmission("../guild")).rejects.toThrow("DISCORD_UNAVAILABLE");
  vi.stubEnv("DISCORD_CALLS_ENABLED", "false");
  await expect(assertGuildAdmission(guild)).rejects.toThrow("DISCORD_UNAVAILABLE");
  expect(mocks.select).not.toHaveBeenCalled();
});
