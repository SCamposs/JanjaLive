import { discordCallErrorMessage, DISCORD_CALL_IDLE_TIMEOUT_MS } from "@janjalive/realtime-protocol";

export const CALL_IDLE_MS = DISCORD_CALL_IDLE_TIMEOUT_MS;

export function discordEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.DISCORD_CALLS_ENABLED === "true";
}

export function discordConfig() {
  if (!discordEnabled()) throw new Error("DISCORD_UNAVAILABLE");
  const { DISCORD_BOT_APPLICATION_ID: appId, DISCORD_BOT_PUBLIC_KEY: publicKey,
    DISCORD_BOT_TOKEN: token, DISCORD_CALLS_ORIGIN: origin } = process.env;
  if (process.env.REALTIME_PROVIDER !== "cloudflare" || !/^\d{17,20}$/.test(appId ?? "") || !/^[a-f\d]{64}$/i.test(publicKey ?? "") || !token
    || !origin || !["https://janja.live", "https://www.janja.live"].includes(origin)) {
    throw new Error("DISCORD_UNAVAILABLE");
  }
  return { appId: appId!, publicKey: publicKey!, token, origin };
}

export function assertDiscordGuild(guildId: string) {
  if (!discordEnabled() || !/^\d{17,20}$/.test(guildId)) throw new Error("DISCORD_UNAVAILABLE");
}

export function discordMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = discordCallErrorMessage(error);
  if (known) return known;
  const messages: Record<string, string> = {
    ROOM_FORBIDDEN: "Seu acesso a esta sala foi revogado.",
    ACCOUNT_DISABLED: "Esta conta não pode usar o JanjaLive.",
    RATE_LIMITED: "Aguarde um instante e tente novamente.",
  };
  return messages[code] ?? "Não foi possível verificar a call agora. Tente novamente.";
}

