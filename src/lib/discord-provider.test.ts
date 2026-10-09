import { describe, expect, it } from "vitest";
import { createDiscordProvider, DISCORD_OAUTH_ISSUER } from "./discord-provider";

describe("Discord OAuth provider", () => {
  it("validates Discord's RFC 9207 callback issuer", () => {
    const provider = createDiscordProvider();

    expect(provider.options?.issuer).toBe(DISCORD_OAUTH_ISSUER);
    expect(provider.options?.issuer).toBe("https://discord.com");
  });

  it("requests identity only", () => {
    const provider = createDiscordProvider();

    expect(provider.options?.authorization).toMatchObject({
      params: { scope: "identify" },
    });
  });
});
