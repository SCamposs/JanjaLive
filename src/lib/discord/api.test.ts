import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discordEnabled, discordConfig, DISCORD_BETA_GUILD } from "./config";
import { getDiscordVoiceChannel, verifyDiscordSignature } from "./api";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const userId = "325447679368757249";
beforeEach(() => {
  vi.stubEnv("DISCORD_CALLS_ENABLED", "true"); vi.stubEnv("DISCORD_CALLS_GUILD_ID", DISCORD_BETA_GUILD);
  vi.stubEnv("DISCORD_BOT_APPLICATION_ID", "1571911647432413255"); vi.stubEnv("DISCORD_BOT_PUBLIC_KEY", publicHex);
  vi.stubEnv("DISCORD_BOT_TOKEN", "fake-token"); vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://www.janja.live");
  vi.stubEnv("REALTIME_PROVIDER", "cloudflare");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Discord beta boundary", () => {
  it("defaults off and cannot be enabled for another guild", () => {
    expect(discordEnabled({})).toBe(false);
    expect(discordEnabled({ DISCORD_CALLS_ENABLED: "true", DISCORD_CALLS_GUILD_ID: "other" })).toBe(false);
    expect(discordEnabled()).toBe(true);
    vi.stubEnv("DISCORD_CALLS_ORIGIN", "https://evil.example");
    expect(() => discordConfig()).toThrow("DISCORD_UNAVAILABLE");
  });
  it("does not fall back to Redis when realtime is not Cloudflare", () => {
    vi.stubEnv("REALTIME_PROVIDER", "upstash");
    expect(() => discordConfig()).toThrow("DISCORD_UNAVAILABLE");
  });
  it("verifies exact signed raw bytes and rejects stale/replayed timestamp or changed body", () => {
    const body = Buffer.from('{ "type": 1 }');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString("hex");
    expect(verifyDiscordSignature(body, timestamp, signature)).toBe(true);
    expect(verifyDiscordSignature(Buffer.from('{"type":1}'), timestamp, signature)).toBe(false);
    expect(verifyDiscordSignature(body, timestamp, signature, Number(timestamp) * 1000 + 301000)).toBe(false);
    expect(verifyDiscordSignature(body, timestamp, "invalid")).toBe(false);
  });
  it("resolves the actual voice channel and validates its guild and type", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ user_id: userId, channel_id: "100000000000000001" }))
      .mockResolvedValueOnce(Response.json({ id: "100000000000000001", guild_id: DISCORD_BETA_GUILD, type: 2 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getDiscordVoiceChannel(userId)).toBe("100000000000000001");
    expect(fetcher.mock.calls[0][0]).toContain(`/voice-states/${userId}`);
  });
  it.each([{ guild_id: "other", type: 2 }, { guild_id: DISCORD_BETA_GUILD, type: 13 }])("rejects wrong guild or Stage", async channel => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ user_id: userId, channel_id: "100000000000000001" }))
      .mockResolvedValueOnce(Response.json({ id: "100000000000000001", ...channel })));
    expect(await getDiscordVoiceChannel(userId)).toBeNull();
  });
  it.each([403, 429, 500])("fails closed on Discord HTTP %i without retries", async status => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: 50001 }, { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getDiscordVoiceChannel(userId)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles a disconnected user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 10065 }, { status: 404 })));
    expect(await getDiscordVoiceChannel(userId)).toBeNull();
  });
});
