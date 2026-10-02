# JanjaLive

Private peer-to-peer screen sharing for small trusted groups.

JanjaLive é uma aplicação independente para criar uma sala privada, convidar amigos autenticados pelo Discord e compartilhar uma tela diretamente entre os navegadores. Não existe feed público, descoberta, gravação, VOD, chat, câmera ou microfone.

## Motivation

### Fatos

Em agosto de 2026, um caso real e grave voltou a expor falhas na proteção de crianças e adolescentes e crimes praticados no ambiente online. Em 6 de agosto, a primeira-dama Janja pediu publicamente o bloqueio do Discord no Brasil. Em 7 de agosto, a ANPD abriu um processo formal de fiscalização. Em 12 de agosto, a ANPD — que foi quem tomou a decisão formal — determinou a suspensão temporária do Go Live e de recursos equivalentes de vídeo no país.

Fontes:

- [Comunicado oficial da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/em-medida-preventiva-anpd-determina-que-discord-suspenda-transmissoes-ao-vivo-no-brasil)
- [Comunicado do Discord sobre os recursos de vídeo no Brasil](https://support.discord.com/hc/pt-br/articles/42704051358359-Por-que-os-recursos-de-v%C3%ADdeo-est%C3%A3o-indispon%C3%ADveis-no-Brasil-no-momento)
- [Folha: contexto e pedido público de Janja em 6 de agosto](https://www1.folha.uol.com.br/cotidiano/2026/08/o-que-se-sabe-sobre-o-caso-que-levou-janja-a-defender-banimento-do-discord-no-brasil.shtml)

A cronologia mostra repercussão e pressão política anteriores à medida, mas não prova que a ANPD agiu por ordem de Janja. Dizer “Janja bloqueou o Discord” seria factualmente incorreto.

### Opinião e motivação do autor

Na visão do autor, aplicar uma restrição genérica da ferramenta a todos foi **uma solução burra para um problema sério**. Crimes e a proteção de menores precisam ser enfrentados diretamente; remover uma tecnologia genérica de comunicação de milhões de usuários legítimos não impede que criminosos migrem para outras plataformas ou meios.

Um problema sério merece uma solução séria. JanjaLive nasceu da frustração com uma restrição ampla aplicada a uma ferramenta usada legitimamente por muita gente — sem minimizar a gravidade que motivou a fiscalização.

JanjaLive não modifica, injeta código, burla, reativa ou explora qualquer parte do Discord. Discord serve somente como identidade OAuth e pode continuar sendo usado separadamente para voz. O vídeo é transportado pela implementação WebRTC do navegador.

## What is JanjaLive

- Salas privadas para grupos normalmente entre 2 e 8 pessoas.
- Aprovação manual por padrão ou entrada automática por convite seguro.
- Membership persistente separado de presence efêmera.
- Vários broadcasters simultâneos.
- Cada viewer recebe somente a stream que escolheu assistir.
- Preview local real antes de publicar a captura.
- Controles simples de resolução, FPS, qualidade e áudio disponível.
- UI dark-first, calma e centrada no player.

## How it works

```text
Browser A
   |
   | auth, room state and signaling
   v
Next.js / Vercel ----------------> Neon + Upstash
   ^
   | auth, room state and signaling
   |
Browser B

MEDIA:

Browser A <=====================> Browser B
                  WebRTC
```

**A seta de mídia não passa pela Vercel.** Next.js fornece autenticação, regras de sala e signaling. Neon guarda autorização persistente. Upstash guarda somente presença, streams ativos e mensagens efêmeras de negociação.

## Architecture

- **Frontend/full-stack:** Next.js App Router, React, TypeScript strict e Tailwind CSS.
- **Authentication:** Auth.js + Discord OAuth (`identify` somente).
- **Persistent data:** Neon PostgreSQL + Drizzle ORM.
- **Ephemeral realtime:** HTTPS polling com heartbeat, exponential backoff e Upstash Redis.
- **Media:** `getDisplayMedia` + `RTCPeerConnection`, uma conexão por broadcaster/viewer escolhido.
- **Validation:** Zod em todos os eventos do control plane.

O signaling não depende de uma Function específica continuar viva. Uma conexão WebRTC já estabelecida continua enquanto possível mesmo durante reconexão do control plane. Leia [`docs/architecture.md`](docs/architecture.md) para diagramas e limites.

## Privacy model

JanjaLive não armazena frames, áudio, screenshots, gravações, estatísticas de mídia ou IPs. SDP e ICE candidates existem apenas no Redis efêmero para negociação e expiram em até 180 segundos; nunca são copiados para PostgreSQL nem para logs da aplicação. Vercel Web Analytics registra somente page views agregadas e anônimas; rotas sensíveis são redigidas antes do envio. Não há Sentry, session replay, pixels externos nem telemetria customizada.

O transporte de mídia WebRTC é criptografado. Como em qualquer conexão P2P, peers podem tecnicamente descobrir informações de endereço de rede durante ICE. Por isso o produto é destinado a pequenos grupos confiáveis.

O inventário completo de dados, provedores e limites está em [`docs/privacy-and-data.md`](docs/privacy-and-data.md).

## Security model

- Sessão Auth.js validada no servidor.
- Roles e identidade nunca são aceitas do cliente.
- Invite de 256 bits; apenas o hash é persistido.
- Short room code não autoriza signaling.
- Owner-only approve, reject, revoke, invite regeneration e room close.
- Rate limit no signaling.
- Eventos de aprovação, revogação e fechamento só podem ser publicados por rotas autorizadas do servidor.
- Credenciais TURN de uma hora somente para membros autenticados e autorizados.
- Sessões expiram em sete dias; tokens OAuth do Discord não são persistidos.
- CSP, HSTS em produção, `frame-ancestors 'none'`, Referrer Policy conservadora e Permissions Policy sem câmera/microfone.
- Logging privacy-first com campos sensíveis redigidos.

## WebRTC P2P and bandwidth

O broadcaster envia uma conexão para cada viewer ativo:

```text
target bitrate × active viewers ≈ outbound upload target
10 Mbps × 3 viewers ≈ 30 Mbps
```

Isso entrega baixa latência e custo de mídia zero para o servidor, mas não escala como uma SFU. O MVP não implementa SFU, MCU, transcoding, gravação nem CDN de vídeo.

## STUN and optional TURN

O padrão é `stun:stun.cloudflare.com:3478`. TURN não é obrigatório. Quando Cloudflare TURN é configurado, o backend troca o segredo longo por credenciais temporárias e retorna apenas estas ao navegador. Sem rota direta e sem TURN, a UI informa claramente que a conexão P2P não pôde ser estabelecida.

## Browser support

Chrome e Edge desktop no Windows são o alvo principal. Firefox e Safari degradam graciosamente. Em navegador sem `getDisplayMedia`, assistir continua permitido e transmitir é desabilitado.

Áudio do sistema só aparece quando o navegador e a fonte retornam uma track de áudio. JanjaLive nunca finge que há áudio e não captura microfone.

## Local development

Requisitos: Node.js 22+, pnpm 11+, banco Neon e uma aplicação Discord.

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Abra `http://localhost:3000` e registre `http://localhost:3000/api/auth/callback/discord` no Discord Developer Portal.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | Neon pooled PostgreSQL connection |
| `AUTH_SECRET` | Yes | Auth.js session/crypto secret |
| `AUTH_DISCORD_ID` | Yes | Discord OAuth application ID |
| `AUTH_DISCORD_SECRET` | Yes | Discord OAuth client secret |
| `AUTH_URL` | Yes | Canonical Auth.js URL (`https://janja.live`) |
| `CRON_SECRET` | Yes | Random secret used by Vercel Cron to authorize room cleanup |
| `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` | Yes | Ephemeral signaling/presence store |
| `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` | Yes | Upstash REST credential |
| `CLOUDFLARE_TURN_KEY_ID` | No | Optional TURN key ID |
| `CLOUDFLARE_TURN_API_TOKEN` | No | Optional TURN API secret |

Never commit real values. `.env.local` is ignored by Git.

## Neon setup

1. Crie um projeto PostgreSQL no Neon ou conecte Neon pelo Vercel Marketplace.
2. Adicione a pooled connection string como `DATABASE_URL`.
3. Gere mudanças com `pnpm db:generate`.
4. Aplique migrations localmente com `pnpm db:migrate`. Na Vercel, o build de produção aplica as migrations versionadas automaticamente antes de compilar.

Presence e WebRTC sessions nunca devem ser movidos para PostgreSQL.

## Vercel deployment

1. Importe o repositório privado na conta pessoal da Vercel.
2. Adicione as variáveis obrigatórias em Production. Use recursos separados antes de habilitá-las em Preview.
3. Defina `AUTH_URL=https://janja.live`.
4. Vincule `janja.live` e aplique os registros DNS mostrados pela Vercel.
5. Registre `https://janja.live/api/auth/callback/discord` no Discord OAuth2.
6. Gere um valor aleatório para `CRON_SECRET`; a Vercel o envia automaticamente ao cron de limpeza como Bearer token.
7. Faça o deploy. A migration é aplicada antes do build quando `DATABASE_URL` está disponível na Vercel.

Vercel recebe somente app, API, auth e signaling; nunca a mídia da tela.

## Room lifecycle

Uma sala expira após três dias sem atividade. Entrar na sala e permanecer nela renovam esse prazo; a renovação persistente é limitada para evitar escrita desnecessária no banco. Salas ocupadas nunca são removidas pelo processo automático.

Após expirar, a sala deixa de aceitar acesso e some da lista. A exclusão física acontece somente depois de mais 30 dias, em uma limpeza diária protegida por `CRON_SECRET`. Se a presença no Redis não puder ser verificada, a limpeza falha de forma segura e não exclui nenhuma candidata.

## GitHub repository setup

O projeto deve permanecer em um repositório **privado** chamado `JanjaLive`, na conta pessoal do proprietário, usando `main` e Conventional Commits. Nenhuma licença open source é adicionada.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pickers de permissão são testados manualmente. Consulte [`docs/manual-webrtc-test.md`](docs/manual-webrtc-test.md) para cenários na mesma máquina, LAN, redes diferentes e tethering.

## Known limitations

- Upload P2P cresce linearmente com os viewers.
- Conectividade direta depende de NAT/rede sem TURN opcional.
- Áudio do sistema e constraints dependem do navegador, SO e fonte.
- Signaling usa polling HTTPS efêmero, sem presumir WebSocket permanente.
- Não há recording, chat, voice, camera, app nativo, SFU ou transcoding.

## Roadmap

- Managed TURN fallback e credential refresh.
- SFU opcional para salas maiores.
- Codec/adaptive quality sem ruído técnico na UI.
- E2EE insertable streams.
- PWA instalável e layouts para múltiplas streams escolhidas.
