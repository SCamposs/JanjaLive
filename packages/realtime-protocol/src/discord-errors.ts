const discordErrors = {
  DISCORD_UNAVAILABLE: "A integração com o Discord está indisponível. Tente novamente mais tarde.",
  DISCORD_CALL_REQUIRED: "Entre na call desta sala no Discord e tente novamente.",
  DISCORD_PERMISSION: "O JanjaLive não tem acesso à call. Peça a um administrador para revisar as permissões do bot.",
  DISCORD_EXPIRED: "Esta sessão foi encerrada. Use /janja no Discord para continuar.",
  DISCORD_IDENTITY: "Entre com a mesma conta do Discord que usou o comando.",
  DISCORD_GUILD_BLOCKED: "A integração do JanjaLive está bloqueada neste servidor.",
} as const;

export function isDiscordCallError(value: unknown): value is keyof typeof discordErrors {
  return typeof value === "string" && Object.hasOwn(discordErrors, value);
}

export function discordCallErrorMessage(error: unknown): string | null {
  const code = error instanceof Error ? error.message.split(/:\s*/).at(-1) : error;
  return isDiscordCallError(code) ? discordErrors[code] : null;
}
