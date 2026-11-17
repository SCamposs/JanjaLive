import { SignJWT } from "jose";
import { expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown) {} } }));
import worker, { GuildPolicyDurableObject } from "./index";
const secret = "fake-realtime-secret-32-characters-long";
const guild = "100000000000000080";
function fixture() {
  const data = new Map<string, unknown>();
  const ctx = { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } };
  const policy = new GuildPolicyDurableObject(ctx as unknown as DurableObjectState, {} as never);
  const update = (blocked: boolean, changedAt: number) => policy.fetch(new Request("https://guild/access", { method: "POST", body: JSON.stringify({ blocked, changedAt }) }));
  return { policy, data, update };
}
it("defaults to allowed without writing a registry, persists transitions and ignores stale retries", async () => {
  const f = fixture();
  expect(await (await f.policy.fetch(new Request("https://guild/access"))).json()).toEqual({ blocked: false });
  expect(f.data.size).toBe(0);
  await f.update(true, 200); await f.update(false, 100);
  expect(await (await f.policy.fetch(new Request("https://guild/access"))).json()).toEqual({ blocked: true });
  await f.update(false, 300); await f.update(true, 200);
  expect(await (await f.policy.fetch(new Request("https://guild/access"))).json()).toEqual({ blocked: false });
  const restored = new GuildPolicyDurableObject({ storage: { get: async (key: string) => f.data.get(key) } } as unknown as DurableObjectState, {} as never);
  expect(await (await restored.fetch(new Request("https://guild/access"))).json()).toEqual({ blocked: false });
});
it("validates policy changes before touching durable state", async () => {
  const f = fixture();
  expect((await f.policy.fetch(new Request("https://guild/access", { method: "POST", body: JSON.stringify({ blocked: "true", changedAt: 1 }) }))).status).toBe(400);
  expect(f.data.size).toBe(0);
});
async function connect(discordGuildId: string | undefined, blocked = false, forgedHeader?: string) {
  const now = Date.now();
  const token = await new SignJWT({ roomId: "room", issuedAtMs: now,
    ...(discordGuildId ? { discordGuildId, roomIdleTimeoutMs: 3_600_000 } : {}) })
    .setProtectedHeader({ alg: "HS256" }).setSubject("user").setIssuer("https://www.janja.live")
    .setAudience("janjalive-realtime").setJti("test").setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 60)
    .sign(new TextEncoder().encode(secret));
  const forwarded = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 200 }));
  const getPolicy = vi.fn(() => ({ fetch: async () => Response.json({ blocked }) }));
  const env = { REALTIME_TOKEN_SECRET: secret, ALLOWED_ORIGINS: "https://www.janja.live",
    GUILD_POLICIES: { getByName: getPolicy }, ROOMS: { getByName: () => ({ fetch: forwarded }) } };
  const response = await worker.fetch(new Request("https://worker/connect", { headers: { origin: "https://www.janja.live", upgrade: "websocket",
    "sec-websocket-protocol": `janjalive-v2,janjalive-token.${token}`, ...(forgedHeader ? { "x-janjalive-discord-guild-id": forgedHeader } : {}) } }), env as never);
  return { response, forwarded, getPolicy };
}
it("denies new connections to blocked guilds, even with a previously signed valid credential", async () => {
  const f = await connect(guild, true);
  expect(f.response.status).toBe(403); expect(f.forwarded).not.toHaveBeenCalled(); expect(f.getPolicy).toHaveBeenCalledWith(guild);
});
it("admits an unblocked installation and never consults guild policy for ordinary rooms or forged client headers", async () => {
  expect((await connect(guild)).response.status).toBe(200);
  const normal = await connect(undefined, true, guild);
  expect(normal.response.status).toBe(200); expect(normal.getPolicy).not.toHaveBeenCalled();
  expect(normal.forwarded.mock.calls[0][0].headers.has("x-janjalive-discord-guild-id")).toBe(false);
});
it("requires service authentication to change policies and never forwards changes to room sockets", async () => {
  const f = fixture(); const getByName = vi.fn(() => ({ fetch: f.policy.fetch.bind(f.policy) }));
  const rooms = vi.fn(); const env = { REALTIME_INTERNAL_SECRET: "fixture-service-secret", GUILD_POLICIES: { getByName }, ROOMS: { getByName: rooms } };
  const make = (authorized: boolean) => new Request(`https://worker/internal/guilds/${guild}/access`, { method: "POST",
    headers: authorized ? { authorization: "Bearer fixture-service-secret" } : {}, body: JSON.stringify({ blocked: true, changedAt: 1 }) });
  expect((await worker.fetch(make(false), env as never)).status).toBe(404); expect(getByName).not.toHaveBeenCalled();
  expect((await worker.fetch(make(true), env as never)).status).toBe(200); expect(rooms).not.toHaveBeenCalled();
});
