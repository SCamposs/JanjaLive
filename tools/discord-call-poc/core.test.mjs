import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createProbe, discordApi, DiscordError, readConfig, validSignature } from './core.mjs';
import { createHandler } from './server.mjs';

const appId = '100000000000000001';
const guildId = '100000000000000002';
const userId = '100000000000000003';
const channelId = '100000000000000004';
const messageId = '100000000000000005';
const otherUser = '100000000000000006';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const config = { appId, guildId, publicKey: publicHex, botToken: 'fake-test-token', users: new Set([userId, otherUser]) };
let sequence = 100000000000001000n;
function interaction(action = 'verificar', changes = {}) {
  return { id: String(sequence++), application_id: appId, guild_id: guildId, type: 2,
    token: 'fake-interaction-token', member: { user: { id: userId } },
    data: { name: 'janja-teste', options: [{ name: 'acao', value: action }] }, ...changes };
}
function fixture(overrides = {}) {
  let clock = Date.now();
  const calls = [];
  const api = async (path, options) => {
    calls.push({ path, options });
    if (path.includes('/voice-states/')) {
      if (overrides.voiceError) throw overrides.voiceError;
      return { user_id: path.split('/').at(-1), channel_id: Object.hasOwn(overrides, 'voiceChannel') ? overrides.voiceChannel : channelId };
    }
    if (/^\/channels\/\d+$/.test(path)) return { id: path.split('/').at(-1), guild_id: guildId, type: overrides.channelType ?? 2 };
    if (path.includes('/messages') && !path.includes('/webhooks/')) return { id: messageId };
    return {};
  };
  const probe = createProbe(config, api, { now: () => clock });
  return { calls, probe, advance: () => { clock += 2100; }, async run(value) {
    const accepted = probe.accept(value);
    await accepted.complete?.();
    return accepted;
  }, reply: () => calls.filter(call => call.path.includes('/webhooks/')).at(-1)?.options.body.content };
}

test('requires explicit configuration and tester allowlist', () => {
  assert.throws(() => readConfig({}), /DISCORD_APPLICATION_ID/);
  assert.throws(() => readConfig({ DISCORD_APPLICATION_ID: appId, DISCORD_TEST_GUILD_ID: guildId,
    DISCORD_PUBLIC_KEY: publicHex, DISCORD_BOT_TOKEN: 'fake' }), /DISCORD_TEST_USER_IDS/);
});

test('Ed25519 authenticates exact raw bytes; rejects tampering, malformed and stale signatures', () => {
  const raw = Buffer.from('{ "type": 1 }');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), raw]), privateKey).toString('hex');
  assert.equal(validSignature(publicHex, raw, timestamp, signature), true);
  assert.equal(validSignature(publicHex, Buffer.from('{"type":1}'), timestamp, signature), false);
  assert.equal(validSignature(publicHex, raw, timestamp, 'zz'), false);
  assert.equal(validSignature(publicHex, raw, timestamp, signature, Number(timestamp) * 1000 + 301000), false);
});

test('PING does not call Discord or require a guild', () => {
  const f = fixture();
  assert.deepEqual(f.probe.accept({ type: 1 }).response, { type: 1 });
  assert.equal(f.calls.length, 0);
});

test('wrong guild, application, tester and unknown command never start external work', async () => {
  for (const changes of [{ guild_id: '999999999999999999' }, { application_id: '999999999999999999' },
    { member: { user: { id: '999999999999999999' } } }, { data: { name: 'other' } }]) {
    const f = fixture();
    const accepted = await f.run(interaction('verificar', changes));
    assert.equal(accepted.response.type, 4);
    assert.equal(f.calls.length, 0);
  }
});

test('ACK is deferred and returned before REST; actual voice channel overrides command text channel', async () => {
  const f = fixture();
  const accepted = f.probe.accept(interaction('verificar', { channel_id: '100000000000000999' }));
  assert.deepEqual(accepted.response, { type: 5, data: { flags: 64 } });
  assert.equal(f.calls.length, 0);
  await accepted.complete();
  assert.match(f.reply(), new RegExp(channelId));
  assert.equal(f.calls.some(call => call.path.includes('100000000000000999')), false);
});

test('unknown voice state gives a useful message; Stage is not admitted', async () => {
  const absent = fixture({ voiceError: new DiscordError(404, 10065) });
  await absent.run(interaction());
  assert.match(absent.reply(), /Entre em uma call/);
  const stage = fixture({ channelType: 13 });
  await stage.run(interaction());
  assert.match(stage.reply(), /Entre em uma call/);
});

test('permission denial and rate limit fail closed without publishing a card or retrying', async () => {
  for (const status of [403, 429]) {
    const f = fixture({ voiceError: new DiscordError(status, 50001) });
    await f.run(interaction('cartao'));
    assert.match(f.reply(), status === 403 ? /não tem acesso/ : /pediu uma pausa/);
    assert.equal(f.calls.filter(call => call.path.includes('/voice-states/')).length, 1);
    assert.equal(f.calls.some(call => call.options?.method === 'POST'), false);
  }
});

test('replay and rapid duplicate actions do not send extra REST requests', async () => {
  const f = fixture();
  const value = interaction();
  await f.run(value);
  const count = f.calls.length;
  await f.run(value);
  await f.run(interaction());
  assert.equal(f.calls.length, count);
});

test('simultaneous creators publish one card; subsequent updates use bot-token message route', async () => {
  const f = fixture();
  await Promise.all([f.run(interaction('cartao')), f.run(interaction('cartao', { member: { user: { id: otherUser } } }))]);
  const posts = f.calls.filter(call => call.options?.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, `/channels/${channelId}/messages`);
  assert.equal(f.calls.filter(call => call.path === `/channels/${channelId}/messages/${messageId}`).length, 1);
  assert.deepEqual(posts[0].options.body.allowed_mentions, { parse: [] });
});

test('card verification checks live voice state and closed sessions reject entry', async () => {
  const f = fixture();
  await f.run(interaction('cartao'));
  const custom_id = f.calls.find(call => call.options?.method === 'POST').options.body.components[0].components[0].custom_id;
  f.advance();
  await f.run(interaction('verificar', { type: 3, data: { custom_id } }));
  assert.match(f.reply(), /Verificação aprovada/);
  f.advance();
  await f.run(interaction('encerrar'));
  const edit = f.calls.filter(call => call.path === `/channels/${channelId}/messages/${messageId}`).at(-1);
  assert.equal(edit.options.body.components[0].components[0].disabled, true);
  f.advance();
  await f.run(interaction('verificar', { type: 3, data: { custom_id } }));
  assert.match(f.reply(), /encerrado/);
});

test('API failures do not leak request token or response body', async () => {
  const api = discordApi(config, async () => new Response(JSON.stringify({ code: 50001, message: 'private payload' }), { status: 403 }));
  await assert.rejects(api('/example'), error => error instanceof DiscordError
    && !error.message.includes(config.botToken) && !error.message.includes('private payload'));
});

test('moving to another call or disconnecting denies a previously valid card', async () => {
  const overrides = {};
  const f = fixture(overrides);
  await f.run(interaction('cartao'));
  const custom_id = f.calls.find(call => call.options?.method === 'POST').options.body.components[0].components[0].custom_id;
  overrides.voiceChannel = '100000000000000999';
  f.advance();
  await f.run(interaction('verificar', { type: 3, data: { custom_id } }));
  assert.match(f.reply(), /Entre na call deste cartão/);
  overrides.voiceChannel = null;
  f.advance();
  await f.run(interaction('verificar', { type: 3, data: { custom_id } }));
  assert.match(f.reply(), /Entre em uma call/);
});

test('real loopback HTTP rejects unsigned requests and accepts signed PING/commands', async t => {
  const calls = [];
  const f = fixture();
  const server = createServer(createHandler(config, f.probe, event => calls.push(event)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/interactions`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(url)).status, 404);
  async function signedRequest(payload) {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json',
      'X-Signature-Timestamp': timestamp,
      'X-Signature-Ed25519': sign(null, Buffer.from(timestamp + body), privateKey).toString('hex'),
    } });
  }
  assert.deepEqual(await (await signedRequest({ type: 1 })).json(), { type: 1 });
  assert.deepEqual(await (await signedRequest(interaction())).json(), { type: 5, data: { flags: 64 } });
  assert.equal((await signedRequest(null)).status, 400);
  assert.equal(calls.filter(item => item.event === 'ack').length, 2);
});
