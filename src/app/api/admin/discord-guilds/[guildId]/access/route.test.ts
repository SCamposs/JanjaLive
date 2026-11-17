import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), change: vi.fn(), db: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db", () => ({ getDb: mocks.db }));
vi.mock("@/lib/discord/guilds", () => ({ setDiscordGuildAccess: mocks.change }));
vi.mock("@/lib/realtime", () => ({ enforceRateLimit: vi.fn() }));
import { POST } from "./route";
const guild = "100000000000000080";
const context = { params: Promise.resolve({ guildId: guild }) };
const request = (body: unknown, origin = "https://www.janja.live") => new Request(`https://www.janja.live/api/admin/discord-guilds/${guild}/access`, {
  method: "POST", headers: { origin, "Content-Type": "application/json", "x-user-id": "owner", "x-discord-id": "discord-owner", authorization: "Bearer owner" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ADMIN_USER_ID", "owner"); vi.stubEnv("ADMIN_DISCORD_USER_ID", "discord-owner");
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.db.mockReturnValue({ select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ id: "owner", providerDiscordId: "discord-owner", accountStatus: "ACTIVE" }] }) }) }) }) });
  mocks.change.mockResolvedValue({ blocked: true, syncPending: false });
});
afterEach(() => vi.unstubAllEnvs());
it("does not accept forged owner headers, IDs or roles without the authenticated owner session", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await POST(request({ blocked: true }), context)).status).toBe(404);
  mocks.auth.mockResolvedValue({ user: { id: "other", discordId: "discord-owner", role: "admin" } });
  expect((await POST(request({ blocked: true }), context)).status).toBe(404);
  expect(mocks.change).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
});
it("requires same-origin mutation and ignores no client-supplied actor or privilege fields", async () => {
  expect((await POST(request({ blocked: true }, "https://attacker.example"), context)).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect((await POST(request({ blocked: true, actorUserId: "owner" }), context)).status).toBe(400);
  expect(mocks.change).not.toHaveBeenCalled();
});
it("uses the server-authenticated actor and reports delivery failure without claiming success", async () => {
  expect((await POST(request({ blocked: true }), context)).status).toBe(200);
  expect(mocks.change).toHaveBeenCalledWith("owner", guild, true);
  mocks.change.mockRejectedValue(new Error("DISCORD_GUILD_SYNC_PENDING"));
  const response = await POST(request({ blocked: true }), context);
  expect(response.status).toBe(503); expect(await response.json()).toHaveProperty("error", "DISCORD_GUILD_SYNC_PENDING");
});
