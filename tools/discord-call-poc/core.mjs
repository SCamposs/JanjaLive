import { createPublicKey, randomBytes, verify } from 'node:crypto';

export const COMMAND = {
  name: 'janja-teste',
  description: 'Prova isolada da integração de calls; não cria salas reais.',
  type: 1,
  default_member_permissions: '0',
  options: [{ name: 'acao', description: 'Etapa do teste', type: 3, choices: [
    { name: 'Verificar minha call', value: 'verificar' },
    { name: 'Criar ou atualizar cartão de teste', value: 'cartao' },
    { name: 'Encerrar meu cartão de teste', value: 'encerrar' },
  ] }],
};

export function readConfig(env) {
  const snowflake = /^\d{17,20}$/;
  for (const key of ['DISCORD_APPLICATION_ID', 'DISCORD_TEST_GUILD_ID']) {
    if (!snowflake.test(env[key] ?? '')) throw new Error(`Preencha ${key}.`);
  }
  if (!/^[a-f\d]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '')) throw new Error('Preencha DISCORD_PUBLIC_KEY.');
  if (!env.DISCORD_BOT_TOKEN?.trim()) throw new Error('Preencha DISCORD_BOT_TOKEN no arquivo local, sem enviar no chat.');
  const users = (env.DISCORD_TEST_USER_IDS ?? '').split(',').map(value => value.trim());
  if (!users.length || users.some(value => !snowflake.test(value))) throw new Error('Preencha DISCORD_TEST_USER_IDS.');
  return { appId: env.DISCORD_APPLICATION_ID, publicKey: env.DISCORD_PUBLIC_KEY,
    botToken: env.DISCORD_BOT_TOKEN.trim(), guildId: env.DISCORD_TEST_GUILD_ID, users: new Set(users) };
}

export function validSignature(publicKey, body, timestamp, signature, now = Date.now()) {
  if (!/^\d{10,12}$/.test(timestamp ?? '') || !/^[a-f\d]{128}$/i.test(signature ?? '')) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex'),
    ]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}

export class DiscordError extends Error {
  constructor(status, code) {
    super('Falha na API Discord');
    this.status = status;
    this.code = code;
  }
}

export function discordApi(config, fetcher = fetch) {
  return async (path, { method = 'GET', body, webhook = false } = {}) => {
    const response = await fetcher(`https://discord.com/api/v10${path}`, {
      method, signal: AbortSignal.timeout(7000), redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(webhook ? {} : { Authorization: `Bot ${config.botToken}` }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    // Never include URLs, response bodies or tokens in errors/logs. No automatic retry of writes.
    if (!response.ok) throw new DiscordError(response.status, result?.code);
    return result;
  };
}

export function errorMessage(error) {
  if (error instanceof DiscordError) {
    if (error.status === 403) return 'O bot não tem acesso. Revise Ver canal, Conectar, Enviar mensagens e Inserir links no canal da call.';
    if (error.status === 429) return 'O Discord pediu uma pausa. Aguarde e tente novamente; nenhuma repetição automática foi enviada.';
    if (error.status === 401) return 'O token do bot não foi aceito. Revise o arquivo local.';
  }
  return 'Não foi possível concluir o teste agora. Tente novamente.';
}

export function createProbe(config, api, { now = Date.now, log = () => {} } = {}) {
  const sessions = new Map();
  const locks = new Map();
  const seen = new Map();
  const lastAction = new Map();

  async function voice(userId) {
    let state;
    try { state = await api(`/guilds/${config.guildId}/voice-states/${userId}`); }
    catch (error) {
      if (error instanceof DiscordError && error.status === 404 && error.code === 10065) return null;
      throw error;
    }
    if (!state?.channel_id) return null;
    if (state.user_id !== userId) throw new Error('Unexpected voice identity');
    const channel = await api(`/channels/${state.channel_id}`);
    if (channel?.guild_id !== config.guildId || channel.type !== 2) return null;
    return channel.id;
  }

  async function locked(channelId, task) {
    const prior = locks.get(channelId) ?? Promise.resolve();
    const running = prior.catch(() => {}).then(task);
    locks.set(channelId, running);
    try { return await running; }
    finally { if (locks.get(channelId) === running) locks.delete(channelId); }
  }

  function card(session, ended = false) {
    return {
      embeds: [{ title: ended ? 'Teste encerrado' : 'JanjaLive · teste de integração',
        description: ended ? 'Este cartão não recebe mais verificações.'
          : 'Verifique se você está nesta call. Este teste não abre sala nem inicia transmissão.', color: 0x961b30 }],
      components: [{ type: 1, components: [{ type: 2, style: 2,
        label: 'Verificar acesso', custom_id: `janja-poc:${session.id}`, disabled: ended }] }],
      allowed_mentions: { parse: [] },
    };
  }

  async function run(interaction) {
    const userId = interaction.member?.user?.id;
    const channelId = await voice(userId);
    if (!channelId) return 'Entre em uma call de voz comum deste servidor e tente novamente.';
    if (interaction.type === 3) {
      const session = [...sessions.values()].find(item => `janja-poc:${item.id}` === interaction.data.custom_id);
      if (!session || session.ended) return 'Este teste foi encerrado. Execute /janja-teste novamente.';
      return session.channelId === channelId
        ? 'Verificação aprovada: você está na call deste cartão. Nenhum acesso real foi concedido.'
        : 'Entre na call deste cartão para continuar.';
    }
    const action = interaction.data.options?.find(item => item.name === 'acao')?.value ?? 'verificar';
    if (action === 'verificar') return `Sua call foi identificada: <#${channelId}>. O bot não entrou no áudio.`;
    if (!['cartao', 'encerrar'].includes(action)) return 'Ação de teste desconhecida.';
    return locked(channelId, async () => {
      const existing = sessions.get(channelId);
      if (action === 'encerrar') {
        if (!existing || existing.ended) return 'Não há cartão de teste ativo nesta call.';
        if (existing.owner !== userId) return 'Somente quem criou este cartão pode encerrá-lo.';
        await api(`/channels/${channelId}/messages/${existing.messageId}`, { method: 'PATCH', body: card(existing, true) });
        existing.ended = true;
        return 'Cartão de teste encerrado.';
      }
      if (existing && !existing.ended) {
        await api(`/channels/${channelId}/messages/${existing.messageId}`, { method: 'PATCH', body: card(existing) });
        return 'O mesmo cartão foi atualizado, sem criar outro.';
      }
      const session = { id: randomBytes(16).toString('hex'), channelId, owner: userId, ended: false };
      const message = await api(`/channels/${channelId}/messages`, { method: 'POST', body: card(session) });
      if (!/^\d{17,20}$/.test(message?.id ?? '')) throw new Error('Unexpected message response');
      session.messageId = message.id;
      sessions.set(channelId, session);
      return 'Cartão de teste publicado no chat da call. Clique em Verificar acesso.';
    });
  }

  const privateMessage = content => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
  return {
    accept(interaction) {
      if (interaction.type === 1) return { response: { type: 1 } };
      if (interaction.application_id !== config.appId || interaction.guild_id !== config.guildId
        || !config.users.has(interaction.member?.user?.id)) {
        return { response: privateMessage('Esta prova está restrita ao servidor e às contas de teste autorizadas.') };
      }
      if (!/^\d{17,20}$/.test(interaction.id ?? '') || !/^[\w.-]{1,512}$/.test(interaction.token ?? '')) {
        return { response: privateMessage('Interação de teste inválida.') };
      }
      if ((interaction.type !== 2 || interaction.data?.name !== COMMAND.name)
        && (interaction.type !== 3 || !/^janja-poc:[a-f\d]{32}$/.test(interaction.data?.custom_id ?? ''))) {
        return { response: privateMessage('Comando de teste desconhecido.') };
      }
      for (const [id, expires] of seen) if (expires <= now()) seen.delete(id);
      if (seen.has(interaction.id)) return { response: { type: 5, data: { flags: 64 } } };
      const userId = interaction.member.user.id;
      if ((lastAction.get(userId) ?? -Infinity) + 2000 > now()) return { response: privateMessage('Aguarde um instante antes de repetir o teste.') };
      if (seen.size >= 1000) return { response: privateMessage('Limite desta rodada atingido. Reinicie a prova.') };
      seen.set(interaction.id, now() + 300_000);
      lastAction.set(userId, now());
      return { response: { type: 5, data: { flags: 64 } }, complete: async () => {
        const started = now();
        let content;
        try { content = await run(interaction); log({ event: 'probe', outcome: 'completed', ms: now() - started }); }
        catch (error) { content = errorMessage(error); log({ event: 'probe', outcome: 'failed', status: error instanceof DiscordError ? error.status : null, ms: now() - started }); }
        try {
          await api(`/webhooks/${config.appId}/${interaction.token}/messages/@original`, {
            method: 'PATCH', webhook: true, body: { content, allowed_mentions: { parse: [] } },
          });
        } catch { log({ event: 'reply', outcome: 'failed' }); }
      } };
    },
  };
}
