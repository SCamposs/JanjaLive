import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), intent: vi.fn(), request: vi.fn(), clean: vi.fn(), delay: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: mocks.delay }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/discord/calls", () => ({ createCallIntent: mocks.intent }));
vi.mock("@/lib/discord/cleanup", async () => ({ ...await vi.importActual("@/lib/discord/cleanup"), cleanDiscordMessages: mocks.clean }));
vi.mock("@/lib/discord/api", async () => ({ ...await vi.importActual("@/lib/discord/api"), discordRequest: mocks.request }));
import { POST } from "./route";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const appId = "1571911647432413255";
const guildId = "1156443434362617927";
const payload = { type: 2, id: "100000000000000001", application_id: appId, guild_id: guildId, token: "fake-interaction-token",
  member: { user: { id: "325447679368757249" } }, data: { name: "janja" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", guildId);
  vi.stubEnv("DISCORD_BOT_APPLICATION_ID", appId); vi.stubEnv("DISCORD_BOT_TOKEN", "fake-token");
  vi.stubEnv("DISCORD_BOT_PUBLIC_KEY", publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex"));
  vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://www.janja.live"); vi.stubEnv("REALTIME_PROVIDER", "cloudflare");
  mocks.intent.mockResolvedValue({ id: "a".repeat(32) }); mocks.request.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
function request(value: unknown) {
  const body = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://www.janja.live/api/discord/interactions", { method: "POST", body, headers: {
    "X-Signature-Timestamp": timestamp,
    "X-Signature-Ed25519": sign(null, Buffer.from(timestamp + body), privateKey).toString("hex"),
  } });
}

it("does no work when the beta is disabled", async () => {
  vi.stubEnv("DISCORD_CALLS_ENABLED", "false");
  expect((await POST(request(payload))).status).toBe(404);
  expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.intent).not.toHaveBeenCalled();
});
it("validates real signed PING and rejects unsigned requests", async () => {
  expect(await (await POST(request({ type: 1 }))).json()).toEqual({ type: 1 });
  expect((await POST(new Request("https://www.janja.live/api/discord/interactions", { method: "POST", body: "{}" }))).status).toBe(401);
  expect(mocks.after).not.toHaveBeenCalled();
});
it("ACKs without database/network work, then delivers only a creator-bound continuation link", async () => {
  expect(await (await POST(request(payload))).json()).toEqual({ type: 5, data: { flags: 64 } });
  expect(mocks.intent).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.intent).toHaveBeenCalledWith(payload.id, payload.member.user.id, guildId);
  const reply = mocks.request.mock.calls[0][1].body;
  expect(reply.components[0].components[0].url).toBe(`https://www.janja.live/discord/${"a".repeat(32)}`);
  expect(reply.allowed_mentions.parse).toEqual([]);
});
it.each([{ ...payload, guild_id: "invalid" }, { ...payload, context: 1 },
  { ...payload, authorizing_integration_owners: { "1": payload.member.user.id } },
  { ...payload, authorizing_integration_owners: { "0": "100000000000000099" } }, { ...payload, application_id: "100000000000000099" }, null])
  ("never schedules unauthorized/malformed interactions", async value => {
    const response = await POST(request(value));
    expect((await response.json()).type).toBe(4);
    expect(mocks.after).not.toHaveBeenCalled();
  });
it("passes the signed guild to deferred verification without requiring a per-guild allowlist", async () => {
  const other = "100000000000000099";
  expect((await (await POST(request({ ...payload, guild_id: other, context: 0, authorizing_integration_owners: { "0": other } }))).json()).type).toBe(5);
  await mocks.after.mock.calls[0][0]();
  expect(mocks.intent).toHaveBeenCalledWith(payload.id, payload.member.user.id, other);
});
it("does not echo secrets or raw errors in a failed deferred response", async () => {
  mocks.intent.mockRejectedValue(new Error("fake-secret-private-stack"));
  await POST(request(payload)); await mocks.after.mock.calls[0][0]();
  expect(JSON.stringify(mocks.request.mock.calls[0][1])).not.toContain("fake-secret-private-stack");
});

const cleanup = { ...payload, channel_id: "100000000000000007", app_permissions: "65536",
  member: { ...payload.member, permissions: "8192" }, data: { name: "janja-limpar" } };
it("denies cleanup without effective moderator permissions even if command permissions were overridden", async () => {
  const response = await POST(request({ ...cleanup, member: { ...cleanup.member, permissions: "0" } }));
  expect((await response.json()).data.content).toContain("Gerenciar mensagens");
  expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.clean).not.toHaveBeenCalled();
});
it("explains missing bot history permission before scheduling cleanup", async () => {
  const response = await POST(request({ ...cleanup, app_permissions: "0" }));
  expect((await response.json()).data.content).toContain("histórico");
  expect(mocks.after).not.toHaveBeenCalled();
});
it("defers cleanup publicly, reports in the same channel and removes the response after six seconds", async () => {
  mocks.clean.mockResolvedValue({ deleted: 2, complete: true });
  expect(await (await POST(request(cleanup))).json()).toEqual({ type: 5, data: {} });
  expect(mocks.clean).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.clean).toHaveBeenCalledWith(payload.guild_id, cleanup.channel_id, payload.member.user.id);
  expect(mocks.intent).not.toHaveBeenCalled();
  expect(mocks.request.mock.calls[0][1].body.content).toContain("2 mensagens do JanjaLive apagadas");
  expect(mocks.delay).toHaveBeenCalledWith(6000);
  expect(mocks.request.mock.calls[1]).toEqual([
    `/webhooks/${appId}/${payload.token}/messages/@original`, { method: "DELETE", webhook: true },
  ]);
  expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.delay.mock.invocationCallOrder[0]);
  expect(mocks.delay.mock.invocationCallOrder[0]).toBeLessThan(mocks.request.mock.invocationCallOrder[1]);
});
it("does not schedule message removal if publishing the cleanup result failed", async () => {
  mocks.clean.mockResolvedValue({ deleted: 0, complete: true }); mocks.request.mockRejectedValue(new Error("timeout"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await POST(request(cleanup)); await mocks.after.mock.calls[0][0]();
  expect(mocks.delay).not.toHaveBeenCalled(); expect(mocks.request).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
