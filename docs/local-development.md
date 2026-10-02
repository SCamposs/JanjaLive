# Local development

## Requirements

- Node.js 22
- pnpm 11.19.0
- PostgreSQL-compatible `DATABASE_URL`
- an Upstash Redis REST URL and token
- a Discord OAuth application

Copy `.env.example` to `.env.local` and fill only local credentials. Never commit that file.

## Web

Run `pnpm dev`, then open `http://localhost:3000`. Add the matching local Discord callback URL to the OAuth application while developing. Database migrations run on configured Vercel builds; use `pnpm db:migrate` when applying them locally.

## Desktop

Run the web backend at its configured origin, then run `pnpm desktop:dev`. Production desktop builds are intentionally locked to `https://janja.live`; do not add a renderer-configurable API origin.

Useful checks:

```text
pnpm check:all
pnpm desktop:package
pnpm audit --audit-level moderate
```

The desktop app must be tested with the real system-browser Discord handoff and installed custom protocol before a release. Development mode alone does not prove installer, deep-link or updater behavior.
