import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), identity: vi.fn(), create: vi.fn(), voice: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/lib/rooms", () => ({ createRoom: mocks.create }));
vi.mock("./access", () => ({ discordIdentity: mocks.identity, assertCallEntry: mocks.voice }));
import { getCallIntent, callCard } from "./calls";

const id = "a".repeat(32);
const fixtureDiscordUserId = "1".padEnd(18, "0");
const intent = { id, discordUserId: fixtureDiscordUserId, guildId: "1156443434362617927", channelId: "100000000000000001" };
function result(rows: unknown[]) {
  const query = { from: () => query, where: () => query, limit: () => Promise.resolve(rows) };
  return query;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", intent.guildId);
  vi.stubEnv("DISCORD_BOT_APPLICATION_ID", "1571911647432413255"); vi.stubEnv("DISCORD_BOT_PUBLIC_KEY", "a".repeat(64));
  vi.stubEnv("DISCORD_BOT_TOKEN", "fake-token"); vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://www.janja.live");
  vi.stubEnv("REALTIME_PROVIDER", "cloudflare");
  mocks.identity.mockResolvedValue(intent.discordUserId);
});
afterEach(() => vi.unstubAllEnvs());

it("binds the creator continuation to the authenticated Discord identity", async () => {
  mocks.select.mockReturnValue(result([intent]));
  await expect(getCallIntent(id, "user")).resolves.toHaveProperty("id", id);
  mocks.identity.mockResolvedValue("100000000000000099");
  await expect(getCallIntent(id, "other-user")).rejects.toThrow("DISCORD_IDENTITY");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("does not provision a room after a banned account or expired/unknown intent", async () => {
  mocks.select.mockReturnValue(result([intent]));
  mocks.identity.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
  await expect(getCallIntent(id, "banned-user")).rejects.toThrow("ACCOUNT_DISABLED");
  mocks.select.mockReturnValue(result([]));
  await expect(getCallIntent(id, "user")).rejects.toThrow("DISCORD_EXPIRED");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("disables creator continuation without contacting the database when flag is off", async () => {
  vi.stubEnv("DISCORD_CALLS_ENABLED", "false");
  await expect(getCallIntent(id, "user")).rejects.toThrow("DISCORD_UNAVAILABLE");
  expect(mocks.select).not.toHaveBeenCalled();
});
it("keeps persistent cards generic, suppresses mentions and removes entry when closed", () => {
  const room = { publicId: "a".repeat(18) };
  const card = callCard(room);
  expect(card.components[0].components[0].url).toBe(`https://www.janja.live/call/${room.publicId}`);
  expect(card.allowed_mentions.parse).toEqual([]);
  expect(callCard(room, true).components).toEqual([]);
});
