import { COMMAND, discordApi, readConfig } from './core.mjs';

try {
  const config = readConfig(process.env);
  const api = discordApi(config);
  const path = `/applications/${config.appId}/guilds/${config.guildId}/commands`;
  if (process.argv[2] === 'register') {
    await api(path, { method: 'POST', body: COMMAND });
    console.log('Comando /janja-teste registrado somente no servidor privado.');
  } else if (process.argv[2] === 'remove') {
    const commands = await api(path);
    const command = commands.find(item => item.name === COMMAND.name && item.type === 1);
    if (command) await api(`${path}/${command.id}`, { method: 'DELETE' });
    console.log('Comando de teste removido. Os outros comandos foram preservados.');
  } else throw new Error('Use register ou remove.');
} catch (error) {
  console.error(error.status ? `API Discord recusou a operação (HTTP ${error.status}). Revise token, instalação e servidor.` : error.message);
  process.exitCode = 1;
}
