import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Room } from "@/db/schema";
const mocks = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn(), request: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ update: mocks.update, select: mocks.select }) }));
vi.mock("./api", async () => ({ ...await vi.importActual("./api"), discordRequest: mocks.request }));
import { publishCallCard } from "./calls";
import { DiscordApiError } from "./api";

const room = { id: "room", publicId: "public-room", discordChannelId: "100000000000000001", discordMessageId: null } as Room;
const messageId = "100000000000000002";
function update(rows: unknown[], error?: Error) {
  const terminal = { returning: async () => rows, then: (resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) =>
    (error ? Promise.reject(error) : Promise.resolve(rows)).then(resolve, reject) };
  return { set: () => ({ where: () => terminal }) };
}
function current(message: string | null) {
  return { from: () => ({ where: () => ({ limit: async () => [{ messageId: message }] }) }) };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
  vi.stubEnv("DISCORD_BOT_APPLICATION_ID", "1571911647432413255"); vi.stubEnv("DISCORD_BOT_PUBLIC_KEY", "a".repeat(64));
  vi.stubEnv("DISCORD_BOT_TOKEN", "fake-token"); vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://www.janja.live");
  vi.stubEnv("REALTIME_PROVIDER", "cloudflare");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("recognizes a stored receipt without contacting Discord", async () => {
  expect(await publishCallCard({ ...room, discordMessageId: messageId })).toBe("published");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("rereads a receipt saved by a concurrent publisher instead of reporting a false failure", async () => {
  mocks.update.mockReturnValue(update([])); mocks.select.mockReturnValue(current(messageId));
  expect(await publishCallCard(room)).toBe("published");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("keeps an unfinished or uncertain concurrent publication pending, without another POST", async () => {
  mocks.update.mockReturnValue(update([])); mocks.select.mockReturnValue(current(null));
  expect(await publishCallCard(room)).toBe("pending");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("does not turn an acknowledged Discord message into a failure when saving its receipt temporarily fails", async () => {
  mocks.update.mockReturnValueOnce(update([{ id: room.id }])).mockReturnValueOnce(update([], new Error("temporary DB error")))
    .mockReturnValueOnce(update([]));
  mocks.request.mockResolvedValue({ id: messageId });
  expect(await publishCallCard(room)).toBe("published");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledTimes(3);
});
it("still reports the acknowledged publication if both receipt writes fail and logs no raw error", async () => {
  mocks.update.mockReturnValueOnce(update([{ id: room.id }])).mockReturnValue(update([], new Error("private DB details")));
  mocks.request.mockResolvedValue({ id: messageId });
  expect(await publishCallCard(room)).toBe("published");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private DB details");
});
it("does not classify a timeout as proof that Discord did not publish", async () => {
  mocks.update.mockReturnValue(update([{ id: room.id }])); mocks.request.mockRejectedValue(new Error("timeout"));
  expect(await publishCallCard(room)).toBe("pending");
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("releases the claim for a definitive rejection so an explicit retry can succeed", async () => {
  mocks.update.mockReturnValue(update([{ id: room.id }])); mocks.request.mockRejectedValue(new DiscordApiError(403));
  expect(await publishCallCard(room)).toBe("failed");
  expect(mocks.update).toHaveBeenCalledTimes(2);
});

it("recovers a lost receipt only on explicit verification and only from this bot's exact card", async () => {
  mocks.update.mockReturnValueOnce(update([])).mockReturnValue(update([]));
  mocks.select.mockReturnValue(current(null));
  const url = `https://www.janja.live/call/${room.publicId}`;
  mocks.request.mockResolvedValue([
    { id: "100000000000000003", author: { id: "other-author" }, components: [{ components: [{ url }] }] },
    { id: "100000000000000004", author: { id: "1571911647432413255" }, components: [{ components: [{ url: "https://www.janja.live/call/other-room" }] }] },
    { id: messageId, author: { id: "1571911647432413255" }, components: [{ components: [{ url }] }] },
  ]);
  expect(await publishCallCard(room, true)).toBe("published");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request.mock.calls[0][0]).toContain("messages?limit=100");
  expect(mocks.update).toHaveBeenCalledTimes(2);
});
it("does not publish again when history is unavailable or contains no matching own card", async () => {
  mocks.update.mockReturnValue(update([])); mocks.select.mockReturnValue(current(null));
  mocks.request.mockRejectedValue(new DiscordApiError(403));
  expect(await publishCallCard(room, true)).toBe("pending");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
