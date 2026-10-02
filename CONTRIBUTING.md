# Contribuindo com o JanjaLive

JanjaLive tem um escopo deliberadamente pequeno: compartilhar uma tela com amigos. Antes de propor algo novo, verifique se a mudança torna esse fluxo mais fácil, seguro, confiável ou agradável sem adicionar chat, voz, câmera, gravação, descoberta pública ou recursos sociais.

## Ambiente local

Requisitos: Node.js 22+, pnpm 11+, PostgreSQL compatível com Neon, Redis compatível com Upstash e uma aplicação Discord OAuth.

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Para o aplicativo desktop:

```bash
pnpm desktop:dev
```

Registre `http://localhost:3000/api/auth/callback/discord` como redirect URI local. Nunca publique valores reais de `.env.local`.

## Antes de enviar uma mudança

```bash
pnpm check:all
```

Mudanças de captura, áudio, WebRTC, presença ou Electron também precisam dos cenários manuais relevantes em [docs/manual-webrtc-test.md](docs/manual-webrtc-test.md) e [docs/desktop-security-checklist.md](docs/desktop-security-checklist.md).

Use commits pequenos e objetivos. Não misture refatorações sem relação com a correção ou melhoria proposta.

## Segurança

Não abra issue pública com credenciais, convites, cookies, descrições WebRTC, candidatos ICE, endereços de rede ou capturas de salas. Siga [SECURITY.md](SECURITY.md).
