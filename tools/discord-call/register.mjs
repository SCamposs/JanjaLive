// Explicit opt-in command registration only; this script is never run by a build.
const env = process.env;
const guildId = '1156443434362617927';
try {
  if (env.DISCORD_CALLS_ENABLED !== 'true' || env.DISCORD_CALLS_GUILD_ID !== guildId
    || !/^\d{17,20}$/.test(env.DISCORD_BOT_APPLICATION_ID ?? '') || !env.DISCORD_BOT_TOKEN) {
    throw new Error('Configure a flag, servidor beta, Application ID e token local.');
  }
  const commands = [
    { name: 'janja', type: 1, description: 'Abra a sala da sua call no JanjaLive.' },
    { name: 'janja-limpar', type: 1, description: 'Apague apenas mensagens recentes do JanjaLive neste canal, preservando as salas.', default_member_permissions: '8192' },
  ];
  for (const command of commands) {
    const response = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_BOT_APPLICATION_ID}/guilds/${guildId}/commands`, {
      method: 'POST', signal: AbortSignal.timeout(7000), redirect: 'error',
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error(`Discord recusou o registro (HTTP ${response.status}).`);
    console.log(`/${command.name} registrado somente no servidor beta. Outros comandos foram preservados.`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
