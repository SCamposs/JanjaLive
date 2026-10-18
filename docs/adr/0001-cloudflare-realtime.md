# ADR 0001: Cloudflare Durable Objects for realtime coordination

Status: accepted on 2026-10-18.

## Context

JanjaLive needs short-lived presence, stream announcements and WebRTC signaling for small private rooms. The first implementation used HTTPS polling backed by Upstash Redis. That transport worked across Vercel instances, but polling multiplied command usage while idle, exhausted the free monthly quota during testing and added avoidable negotiation latency.

Media never belongs in this coordination service. Screen video and system audio remain WebRTC peer-to-peer, with Cloudflare TURN used only when a direct path is unavailable.

## Decision

Production realtime coordination uses one SQLite-backed Cloudflare Durable Object per room and hibernatable WebSockets. A second Durable Object class provides low-volume atomic rate limits for Vercel API routes that previously depended on Redis.

`REALTIME_PROVIDER` selects `cloudflare`, `upstash` or `disabled`. Upstash remains a temporary rollback adapter while the Cloudflare transport is stabilized; it is not the production default.

The browser and desktop client request a 60-second connection token from the authenticated Vercel API. The token contains only the user ID, room ID, audience, issuer, issued-at, expiry and a unique ID. The Worker validates it before routing the WebSocket to the room object. Tokens travel in the WebSocket subprotocol header instead of the URL.

Administrative room events, presence checks and rate-limit requests use a separate server-to-Worker secret. The two trust purposes deliberately do not share a credential.

## Security boundaries

- Vercel remains authoritative for Discord identity, room lifetime and membership.
- The Worker accepts browser and desktop origins from an exact allowlist.
- A valid room token is short-lived and cannot authorize another room.
- The desktop network policy permits only the canonical JanjaLive API, Discord CDN and the exact realtime Worker host.
- SDP and ICE candidates are ephemeral and are neither logged nor copied to PostgreSQL.
- Revocation and room closure events close affected WebSockets immediately.
- Message sizes and schemas are validated before fan-out.

## Operational behavior

WebSocket Hibernation keeps connections open without pinning an idle object in memory. Connection attachments retain user and active-stream state across hibernation. Once WebRTC is established, a realtime-provider interruption does not carry or interrupt media, but it can prevent new viewers, renegotiation and membership notifications until reconnect succeeds.

The Worker is deployed from `apps/realtime-worker`. Its `ROOMS` and `RATE_LIMITS` bindings and SQLite migrations live in `wrangler.jsonc`; runtime secrets remain only in Cloudflare and Vercel.

## Rollback

Set `REALTIME_PROVIDER=upstash` and redeploy Vercel. Existing Upstash variables are intentionally retained during the stabilization window. `disabled` stops realtime explicitly and produces a service-unavailable response instead of silently falling back.

## Consequences

This removes the idle polling cost and should reduce signaling latency. It adds a separately deployed Worker and requires versioned protocol compatibility across web, desktop and Worker. The shared `@janjalive/realtime-protocol` package is the canonical schema boundary.
