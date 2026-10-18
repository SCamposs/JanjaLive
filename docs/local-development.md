# Local development

## Requirements

- Node.js 22
- pnpm 11.19.0
- PostgreSQL-compatible `DATABASE_URL`
- a Cloudflare Worker configured from `apps/realtime-worker` (recommended), or Upstash credentials for rollback testing
- a Discord OAuth application

Copy `.env.example` to `.env.local` and fill only local credentials. Never commit that file.

## Web

Run `pnpm dev`, then open `http://localhost:3000`. Add the matching local Discord callback URL to the OAuth application while developing. Database migrations run on configured Vercel builds; use `pnpm db:migrate` when applying them locally.

## Desktop

Run the web backend at its configured origin, then run `pnpm desktop:dev`. Production desktop builds are intentionally locked to `https://www.janja.live`; do not add a renderer-configurable API origin.

Useful checks:

```text
pnpm check:all
pnpm desktop:package
pnpm audit --audit-level moderate
```

The desktop app must be tested with the real system-browser Discord handoff and installed custom protocol before a release. Development mode alone does not prove installer, deep-link or updater behavior.
For Cloudflare realtime, set `REALTIME_PROVIDER=cloudflare`, `CLOUDFLARE_REALTIME_URL`, `REALTIME_TOKEN_SECRET` and `REALTIME_INTERNAL_SECRET` in the web environment. Put the same two secrets in the Worker runtime. Run the Worker locally from `apps/realtime-worker` with Wrangler; never commit `.dev.vars`.

Use `REALTIME_PROVIDER=upstash` only to exercise the rollback path. `REALTIME_PROVIDER=disabled` is an explicit maintenance mode and does not fall back automatically.
