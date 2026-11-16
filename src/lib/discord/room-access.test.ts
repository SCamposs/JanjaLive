import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), batch: vi.fn(), voice: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select: mocks.select, batch: mocks.batch }) }));
vi.mock("./access", () => ({ assertCallEntry: mocks.voice }));
import { getRoomSnapshotByPublicId, requestRoomAccess, assertAuthorizedRoom } from "../rooms";

const call = { id: "room", publicId: "public", name: "Sala da call", accessMode: "INVITE", discordGuildId: "1156443434362617927",
  discordChannelId: "100000000000000001", discordSessionEndsAt: new Date(Date.now() + 60000), closedAt: null, expiresAt: new Date(Date.now() + 60000) };
const revoked = { userId: "user", roomId: "room", role: "MEMBER", revokedAt: new Date() };
function selectResult(rows: unknown[]) {
  const query = { from: () => query, where: () => query, leftJoin: () => query, limit: () => Promise.resolve(rows) };
  return query;
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", call.discordGuildId); });
afterEach(() => vi.unstubAllEnvs());

it("does not restore a revoked membership just because the user is in the call", async () => {
  mocks.select.mockReturnValueOnce(selectResult([call])).mockReturnValueOnce(selectResult([revoked]));
  await expect(getRoomSnapshotByPublicId("public", "user")).rejects.toThrow("ROOM_FORBIDDEN");
  expect(mocks.voice).not.toHaveBeenCalled(); expect(mocks.batch).not.toHaveBeenCalled();
});
it("checks voice at entry even for a previously admitted member", async () => {
  mocks.select.mockReturnValueOnce(selectResult([call])).mockReturnValueOnce(selectResult([{ ...revoked, revokedAt: null }]));
  mocks.voice.mockRejectedValue(new Error("DISCORD_CALL_REQUIRED"));
  await expect(getRoomSnapshotByPublicId("public", "user")).rejects.toThrow("DISCORD_CALL_REQUIRED");
  expect(mocks.batch).not.toHaveBeenCalled();
});
it("does not offer ordinary approval as a back door into a call room", async () => {
  mocks.select.mockReturnValueOnce(selectResult([call]));
  await expect(requestRoomAccess("room", "user")).rejects.toThrow("DISCORD_CALL_REQUIRED");
});
it("requires a valid grant for realtime and refuses call rooms when flag is disabled", async () => {
  mocks.select.mockReturnValue(selectResult([{ room: call, member: null }]));
  await expect(assertAuthorizedRoom("room", "outsider")).rejects.toThrow("ROOM_FORBIDDEN");
  vi.stubEnv("DISCORD_CALLS_ENABLED", "false");
  mocks.select.mockReturnValue(selectResult([{ room: call, member: { ...revoked, revokedAt: null } }]));
  await expect(assertAuthorizedRoom("room", "user")).rejects.toThrow("DISCORD_UNAVAILABLE");
});
it("keeps ordinary-room authorization independent of Discord with the flag disabled", async () => {
  vi.stubEnv("DISCORD_CALLS_ENABLED", "false");
  mocks.select.mockReturnValue(selectResult([{ room: { ...call, discordGuildId: null }, member: { ...revoked, revokedAt: null } }]));
  await expect(assertAuthorizedRoom("room", "user")).resolves.toHaveProperty("room");
  expect(mocks.voice).not.toHaveBeenCalled();
});

it("keeps call creation fields unavailable in the ordinary API schema", async () => {
  const { createRoomSchema } = await import("../schemas");
  expect(createRoomSchema.safeParse({ accessMode: "INVITE", discordCall: { guildId: call.discordGuildId, channelId: call.discordChannelId } }).success).toBe(false);
});
