import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ request: vi.fn(), rate: vi.fn(), set: vi.fn(), where: vi.fn() }));
vi.mock("./api", async () => ({ ...await vi.importActual("./api"), discordRequest: mocks.request }));
vi.mock("@/lib/realtime", () => ({ enforceRateLimit: mocks.rate }));
vi.mock("@/db", () => ({ getDb: () => ({ update: () => ({ set: mocks.set }) }) }));
import { canCleanDiscordMessages, canReadDiscordHistory, cleanDiscordMessages, cleanupMessage } from "./cleanup";
import { DiscordApiError } from "./api";

const guild = "1156443434362617927";
const app = "100000000000000001";
const channel = "100000000000000002";
const user = "100000000000000003";
const own = { id: "100000000000000004", author: { id: app } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", guild);
  vi.stubEnv("DISCORD_BOT_APPLICATION_ID", app); vi.stubEnv("DISCORD_BOT_PUBLIC_KEY", "a".repeat(64));
  vi.stubEnv("DISCORD_BOT_TOKEN", "fake-token"); vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://www.janja.live");
  vi.stubEnv("REALTIME_PROVIDER", "cloudflare");
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.request.mockResolvedValueOnce({ id: channel, guild_id: guild });
});
afterEach(() => vi.unstubAllEnvs());

it("accepts only moderator/admin effective permissions and checks history separately", () => {
  expect(canCleanDiscordMessages("8192")).toBe(true);
  expect(canCleanDiscordMessages("8")).toBe(true);
  for (const value of ["0", "65536", "-1", "", "bogus"]) expect(canCleanDiscordMessages(value)).toBe(false);
  expect(canReadDiscordHistory("65536")).toBe(true);
  expect(canReadDiscordHistory("8192")).toBe(false);
});
it("deletes only exact own-author messages, including older messages, and changes only their card receipts", async () => {
  mocks.request.mockResolvedValueOnce([own, { id: "100000000000000005", author: { id: user } }]).mockResolvedValue(null);
  expect(await cleanDiscordMessages(guild, channel, user)).toEqual({ deleted: 1, complete: true });
  expect(mocks.request.mock.calls.filter(([, options]) => options?.method === "DELETE")).toEqual([
    [`/channels/${channel}/messages/${own.id}`, { method: "DELETE" }],
  ]);
  expect(mocks.set).toHaveBeenCalledWith({ discordMessageId: null, discordCardClaimedAt: null });
  const sql = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(sql.params).toEqual([guild, channel, own.id]);
  expect(sql.sql).toContain('"discord_message_id"');
  expect(mocks.set).toHaveBeenLastCalledWith({ discordCardClaimedAt: null });
});
it("fails closed for another guild or a channel belonging to another guild", async () => {
  await expect(cleanDiscordMessages(user, channel, user)).rejects.toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.request.mockReset().mockResolvedValue({ id: channel, guild_id: user });
  await expect(cleanDiscordMessages(guild, channel, user)).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("stops without deleting when the shared rate limit rejects", async () => {
  mocks.rate.mockRejectedValue(new Error("RATE_LIMITED"));
  await expect(cleanDiscordMessages(guild, channel, user)).rejects.toThrow("RATE_LIMITED");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("reports partial progress on Discord rate limits without retrying or touching other messages", async () => {
  mocks.request.mockResolvedValueOnce([own, { ...own, id: "100000000000000006" }])
    .mockResolvedValueOnce(null).mockRejectedValueOnce(new DiscordApiError(429));
  const result = await cleanDiscordMessages(guild, channel, user);
  expect(result).toEqual({ deleted: 1, complete: false });
  expect(cleanupMessage(result)).toContain("parcial");
  expect(mocks.where).toHaveBeenCalledTimes(1);
});
it("handles an already deleted message and clears only its receipt", async () => {
  mocks.request.mockResolvedValueOnce([own]).mockRejectedValueOnce(new DiscordApiError(404, 10008));
  expect(await cleanDiscordMessages(guild, channel, user)).toEqual({ deleted: 1, complete: true });
  expect(mocks.where).toHaveBeenCalledTimes(2);
});
it("paginates history without bulk delete and caps deletions at twenty", async () => {
  const others = Array.from({ length: 100 }, (_, i) => ({ id: String(BigInt("100000000000000300") - BigInt(i)), author: { id: user } }));
  const ownMessages = Array.from({ length: 25 }, (_, i) => ({ ...own, id: String(BigInt("100000000000000200") - BigInt(i)) }));
  mocks.request.mockResolvedValueOnce(others).mockResolvedValueOnce(ownMessages).mockResolvedValue(null);
  expect(await cleanDiscordMessages(guild, channel, user)).toEqual({ deleted: 20, complete: false });
  expect(mocks.request.mock.calls[2][0]).toContain(`before=${others.at(-1)!.id}`);
  expect(mocks.request.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(20);
});
it("never deletes when history is denied and does not clear receipts after a rejected deletion", async () => {
  mocks.request.mockResolvedValueOnce([own]).mockRejectedValueOnce(new DiscordApiError(403));
  await expect(cleanDiscordMessages(guild, channel, user)).rejects.toThrow("DISCORD_PERMISSION");
  expect(mocks.where).not.toHaveBeenCalled();
});
it("releases only channel-local receiptless reservations after an exhaustive empty-history cleanup", async () => {
  mocks.request.mockResolvedValueOnce([]);
  expect(await cleanDiscordMessages(guild, channel, user)).toEqual({ deleted: 0, complete: true });
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith({ discordCardClaimedAt: null });
  const sql = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(sql.params.slice(0, 2)).toEqual([guild, channel]);
  expect(new Date(String(sql.params[2])).getTime()).toBeLessThanOrEqual(Date.now() - 60_000);
  expect(sql.sql).toContain('"discord_message_id" is null');
});
it("clears a missing receipt only for the exact verified own card URL, without overwriting another receipt", async () => {
  const publicId = "a".repeat(18);
  mocks.request.mockResolvedValueOnce([{ ...own, components: [{ components: [{ url: `https://www.janja.live/call/${publicId}` }] }] }]).mockResolvedValue(null);
  await cleanDiscordMessages(guild, channel, user);
  const sql = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(sql.params).toEqual([guild, channel, own.id, publicId]);
  expect(sql.sql).toContain('"discord_message_id" is null');
});
it("does not release unrelated pending reservations after reaching the history scan bound", async () => {
  const others = Array.from({ length: 100 }, (_, i) => ({ id: String(BigInt("100000000000000900") - BigInt(i)), author: { id: user } }));
  for (let page = 0; page < 5; page++) mocks.request.mockResolvedValueOnce(others.map(message => ({ ...message, id: String(BigInt(message.id) - BigInt(page * 100)) })));
  expect(await cleanDiscordMessages(guild, channel, user)).toEqual({ deleted: 0, complete: false });
  expect(mocks.set).not.toHaveBeenCalled();
});
