# Privacy and data boundaries

This document describes the data paths implemented by JanjaLive. It is a technical inventory, not a promise that external infrastructure or an authorized viewer cannot observe anything.

## PostgreSQL data

Neon PostgreSQL stores only data needed for authentication and room authorization:

| Category | Stored fields | Reason |
|---|---|---|
| Discord profile | Internal user ID, Discord ID, username, display name, avatar URL | Identify people in a room |
| Account link | Provider name and Discord account ID | Reconnect the same Discord account |
| Session | Opaque session token, user ID, expiration | Keep the user signed in |
| Room | Internal/public IDs, short code, invite hash, owner, optional name, access mode and lifecycle timestamps | Resolve rooms, enforce access and expire inactive rooms |
| Membership | Room/user IDs, owner/member role, approval and revocation timestamps | Keep permission independent from online presence |
| Join request | Room/user IDs, status and resolution timestamps | Let the owner approve or reject access |

Discord OAuth access, refresh and ID tokens are discarded before the account link is written. The app asks Discord only for the `identify` scope, so email is not requested. Session lifetime is limited to seven days and refreshed at most once per day.

The database does **not** store screen frames, video, audio, screenshots, files, clipboard contents, process names, window titles, SDP, ICE candidates, IP addresses, quality statistics or stream history.

## Ephemeral signaling

Upstash Redis temporarily holds presence, active-stream announcements and WebRTC negotiation messages. SDP and ICE candidates can contain network information. JanjaLive sets a 180-second TTL and keeps at most 400 recent events per room. These values are never copied to PostgreSQL or application logs.

Upstash is still an infrastructure provider that receives the signaling requests. Its own operational logs, backups and legal retention are governed by the selected Upstash plan and agreement, not by this repository. Production setup must use a private database, scoped credentials and the shortest provider retention available.

## Screen capture

On the web, `navigator.mediaDevices.getDisplayMedia()` is called only after the user presses **Compartilhar tela**. The browser and operating system show their native picker, and JanjaLive receives only the `MediaStream` returned for the selected screen, window or tab.

On Windows desktop, Electron lists screens and application windows in JanjaLive's own picker. A choice creates a short-lived, one-use permission tied to that application window; only then can Chromium create the selected `MediaStream`. The Electron main process never receives video frames. Source IDs and window titles are not persisted or logged, and sharing is never restored after restart.

Neither client calls `getUserMedia`, camera APIs, microphone APIs, file pickers, directory APIs or clipboard read APIs. The desktop client can write a newly generated invite link to the clipboard only after the room owner asks it to. Camera and microphone permissions are denied.

System or tab audio is requested with the display picker and exists only when the browser returns an audio track. JanjaLive never captures microphone audio.

## Media path

Media tracks are attached directly to browser `RTCPeerConnection` instances only after a viewer chooses **Assistir**. Vercel, Neon and Upstash do not receive or store media frames.

When TURN is configured and a direct route cannot be established, Cloudflare may relay encrypted WebRTC packets. A relay can observe connection metadata and traffic volume, but WebRTC media remains encrypted in transit. TURN credentials are short-lived, limited to one hour and issued only to an authenticated, authorized room member.

## Limits that cannot be removed

- An authorized viewer can record the screen with software or another device. JanjaLive cannot prevent that.
- WebRTC participants and STUN/TURN infrastructure can observe network metadata during connection establishment. Raw peer addresses are never displayed in the JanjaLive UI or intentionally logged by the app.
- Vercel, Neon, Upstash, Cloudflare and Discord can observe the metadata necessary to provide their services. Their platform-level logging and retention must be reviewed in the production account.
- Browser extensions, malware or a compromised operating system are outside the web application's security boundary.

## Web analytics

Vercel Web Analytics records anonymous aggregate page views without third-party cookies. Vercel may derive country, browser, operating system and device type for aggregate reports. The daily visitor hash is discarded after 24 hours according to Vercel's service documentation.

JanjaLive strips query strings and fragments and replaces `/room/<invite>` and `/join/<public-id>` values before an event is sent. It does not configure custom events, session replay or analytics properties containing user, room, media or signaling data.

## Production checklist

- Keep the Neon and Upstash databases private. The public GitHub repository must never contain production credentials.
- Use separate scoped credentials for production and preview, and rotate them after any suspected exposure.
- Never place server secrets in variables prefixed with `NEXT_PUBLIC_`.
- Configure `AUTH_URL=https://janja.live` and the exact Discord callback `https://janja.live/api/auth/callback/discord`.
- Enable MFA on GitHub, Vercel, Discord, Neon, Upstash and Cloudflare accounts.
- Review provider access logs and retention settings before inviting real users.
- Do not enable request-body logging, session replay, custom analytics containing application data or error-reporting tools that capture application payloads.
- Run the manual two-browser privacy checklist in `docs/manual-webrtc-test.md` before production use.
