export function getConfiguredOwner(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const userId = environment.ADMIN_USER_ID;
  const discordId = environment.ADMIN_DISCORD_USER_ID;
  if (!userId || !discordId) throw new Error("ADMIN_NOT_CONFIGURED");
  return { userId, discordId };
}

export function isOwnerIdentity(
  identity: { userId: string; discordId: string | null },
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const owner = getConfiguredOwner(environment);
  return identity.userId === owner.userId && identity.discordId === owner.discordId;
}

export function assertAdminTarget(actorUserId: string, targetUserId: string, ownerUserId: string) {
  if (actorUserId !== ownerUserId) throw new Error("NOT_FOUND");
  if (targetUserId === ownerUserId) throw new Error("ADMIN_SELF_BAN");
}
