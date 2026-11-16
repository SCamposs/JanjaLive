import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createProbe, discordApi, readConfig, validSignature } from './core.mjs';

export function createHandler(config, probe, log = () => {}) {
  return async (request, response) => {
    const started = performance.now();
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST' || request.url !== '/interactions') return send(404, { error: 'not_found' });
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) return send(413, { error: 'too_large' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!validSignature(config.publicKey, body, request.headers['x-signature-timestamp'], request.headers['x-signature-ed25519'])) {
        return send(401, { error: 'invalid_signature' });
      }
      const interaction = JSON.parse(body.toString('utf8'));
      if (!interaction || typeof interaction !== 'object' || Array.isArray(interaction)) return send(400, { error: 'invalid_body' });
      const accepted = probe.accept(interaction);
      response.once('finish', () => {
        log({ event: 'ack', ms: Math.round((performance.now() - started) * 100) / 100 });
        if (accepted.complete) void accepted.complete().catch(() => log({ event: 'completion', outcome: 'failed' }));
      });
      return send(200, accepted.response);
    } catch { if (!response.headersSent) send(400, { error: 'invalid_body' }); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = readConfig(process.env);
    const log = event => console.log(JSON.stringify(event));
    const probe = createProbe(config, discordApi(config), { log });
    const server = createServer(createHandler(config, probe, log));
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.maxConnections = 20;
    server.on('error', () => { console.error('Não foi possível abrir a porta local 8789.'); process.exitCode = 1; });
    server.listen(8789, '127.0.0.1', () => console.log('Prova isolada em http://127.0.0.1:8789/interactions. Nenhuma conexão ao JanjaLive.'));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
