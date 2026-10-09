import Discord from "next-auth/providers/discord";

export const DISCORD_OAUTH_ISSUER = "https://discord.com";

export function createDiscordProvider() {
  return Discord({
    issuer: DISCORD_OAUTH_ISSUER,
    authorization: { params: { scope: "identify" } },
    profile(profile) {
      const avatar = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;

      return {
        id: profile.id,
        discordId: profile.id,
        username: profile.username,
        displayName: profile.global_name ?? profile.username,
        avatar,
        name: profile.global_name ?? profile.username,
        image: avatar,
      };
    },
  });
}
