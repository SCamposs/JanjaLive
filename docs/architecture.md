# JanjaLive architecture

JanjaLive is a private control plane around browser-native WebRTC. Persistent authorization lives in PostgreSQL; presence and signaling are ephemeral; media stays between participating browsers.

```mermaid
flowchart LR
  A[Browser A] -->|HTTPS: auth, rooms, signaling| V[Next.js on Vercel]
  B[Browser B] -->|HTTPS: auth, rooms, signaling| V
  V --> N[(Neon PostgreSQL)]
  V --> R[(Upstash Redis: ephemeral)]
  A <-->|WebRTC media - never through Vercel| B
```

## 1. Authentication

Auth.js uses Discord OAuth with only the `identify` scope. Discord is an identity provider, not a media transport. The stable Discord account ID is mapped to an internal user record. Cookies and OAuth protections are handled by Auth.js; every room and signaling endpoint derives the user from the server-side session.

## 2. Persistent data

Neon PostgreSQL is the source of truth for users, rooms, authorized members, and join requests. Drizzle owns the schema and checked-in SQL migrations. Invite tokens, presence, WebRTC descriptions, ICE candidates, media, and stats are not persisted there.

## 3. Room membership

Membership is authorization. An authorized member remains listed while offline. `room_members.revoked_at` invalidates access without erasing the audit trail. Only the owner may approve, reject, revoke, regenerate an invite, or close a room. The owner cannot revoke themselves.

Room URLs contain a random 256-bit invite token. Only its SHA-256 hash is stored. A short room code is a convenience identifier and is never used by the signaling routes as proof of authorization.

## 4. Presence

Presence is an expiring Redis heartbeat, independent from membership. A browser is considered online only while recent heartbeats exist. Redis loss may temporarily hide presence but cannot change who is authorized.

## 5. Signaling

The client sends validated control events over short HTTPS requests and polls an ephemeral Redis queue. This serverless transport was selected because it behaves predictably on the Vercel Hobby tier and does not bind correctness to one warm Function instance. The client implements heartbeat, exponential backoff, and resynchronizes presence and active streams after reconnecting.

Every event is checked against the Auth.js session, active room, sender membership, and (for directed messages) target membership. Redis entries expire quickly. SDP and ICE candidates are never logged or copied to PostgreSQL.

## 6. WebRTC negotiation

When a viewer clicks **Assistir**, it sends `watch:request` to one broadcaster. Only then does the broadcaster create one `RTCPeerConnection`, attach its chosen screen stream, and exchange offer, answer, and ICE candidates through signaling. Other available streams consume no viewer bandwidth.

```mermaid
sequenceDiagram
  participant V as Viewer
  participant C as Control plane
  participant B as Broadcaster
  V->>C: watch:request(B)
  C->>B: authorized request
  B->>C: WebRTC offer
  C->>V: offer
  V->>C: answer + ICE
  C->>B: answer + ICE
  B-->>V: encrypted WebRTC media
```

An established peer connection is not closed merely because signaling reconnects. Connections close on stop watching, broadcaster stop, native share end, revocation, room close, or component teardown.

## 7. Media flow

Screen video and optional system audio travel through WebRTC. Vercel, Neon, and Redis never receive media frames. One broadcaster uploads approximately target bitrate multiplied by active viewers. This mesh is intentionally designed for a trusted group of roughly 2–8 people, not mass distribution.

## 8. Screen capture

Capture begins only after the user clicks **Compartilhar tela**. The browser-native picker is authoritative. JanjaLive shows the returned `MediaStream` in a large local preview, then applies best-effort constraints only after confirmation. Canceling stops every track. The native stop button is observed through `track.onended`.

## 9. Audio

`getDisplayMedia({ audio: true })` requests system/source audio. The UI reports a track only when the browser actually returns one. No microphone or camera is requested. Windows Chrome/Edge is the primary target; source and browser restrictions are expected elsewhere.

## 10. Quality control

The UI offers resolution, frame rate, and simple Auto/High/Custom quality. Internally, presets map to sensible target bitrates. `applyConstraints` and `RTCRtpSender.setParameters` are best-effort browser hints; the product does not promise an exact encoded rate.

## 11. Security boundaries

- Identity and roles come from the session and database, never request fields.
- Invite tokens are high entropy and stored only as hashes.
- Zod validates every control-plane message.
- Directed signaling is restricted to active members of the same room.
- Security headers disable framing, camera, and microphone access.
- Logs redact keys associated with credentials, invitations, SDP, ICE, cookies, and IP addresses.
- No analytics, trackers, recording, VOD, chat, or media storage are included.

WebRTC media transport is encrypted. P2P peers may still learn network-address information during ICE negotiation; JanjaLive is deliberately intended for small trusted groups.

## 12. Failure and reconnect behavior

Signaling polling backs off after failures and returns to the normal cadence after recovery. Active streams and presence are resynchronized from Redis. Existing working media connections are kept alive. If no direct route can be established and no TURN fallback exists, the viewer sees a clear failure message.

## 13. P2P scalability limits

Each viewer creates an extra outbound encoding path at the broadcaster. At 10 Mbps, three viewers target roughly 30 Mbps outbound. Eight people is a UX target, not a hard cap. SFU, MCU, transcoding, recording, and automatic multi-stream download are intentionally out of scope.

## 14. Optional TURN path

The default ICE configuration is `stun:stun.cloudflare.com:3478`. When Cloudflare TURN server credentials are configured, a server route exchanges the long-term secret for short-lived ICE credentials and returns only those temporary credentials to the browser. TURN is optional and never silently required for the core deployment.
