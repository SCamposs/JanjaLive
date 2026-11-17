// Explicit command registration only; never run by a build or per installation.
import { commands } from './commands.mjs';
const env = process.env;
try {
  if (env.DISCORD_CALLS_ENABLED !== 'true'
    || !/^\d{17,20}$/.test(env.DISCORD_BOT_APPLICATION_ID ?? '') || !env.DISCORD_BOT_TOKEN) {
    throw new Error('Configure a flag, Application ID e token local.');
  }
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      method, signal: AbortSignal.timeout(7000), redirect: 'error',
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Discord recusou a operação (HTTP ${response.status}).`);
    return response.status === 204 ? null : response.json();
  };
  const app = await api('/oauth2/applications/@me');
  if (app.id !== env.DISCORD_BOT_APPLICATION_ID) throw new Error('O token não pertence à aplicação configurada.');
  if (app.bot_public !== false) throw new Error('Desative Bot público no Developer Portal antes de registrar os comandos globais.');
  for (const command of commands) {
    await api(`/applications/${env.DISCORD_BOT_APPLICATION_ID}/commands`, 'POST', command);
    console.log(`/${command.name} registrado globalmente, somente para servidores. Outros comandos foram preservados.`);
  }
  const cleanupArg = process.argv.find(value => value.startsWith('--remove-guild-commands='));
  if (cleanupArg) {
    const guildId = cleanupArg.slice('--remove-guild-commands='.length);
    if (!/^\d{17,20}$/.test(guildId)) throw new Error('ID de servidor inválido para remover comandos antigos.');
    const old = await api(`/applications/${env.DISCORD_BOT_APPLICATION_ID}/guilds/${guildId}/commands`);
    for (const command of old) {
      if (commands.some(item => item.name === command.name) && /^\d{17,20}$/.test(command.id)) {
        await api(`/applications/${env.DISCORD_BOT_APPLICATION_ID}/guilds/${guildId}/commands/${command.id}`, 'DELETE');
        console.log(`Comando local /${command.name} substituído pelo global.`);
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
