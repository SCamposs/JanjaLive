# Privacy and data boundaries

This document describes the data paths implemented by JanjaLive. It is a technical inventory, not a promise that external infrastructure or an authorized viewer cannot observe anything.

## PostgreSQL data

Neon PostgreSQL stores only data needed for authentication and room authorization:

| Category | Stored fields | Reason |
|---|---|---|
| Discord profile | Internal user ID, Discord ID, username, display name, avatar URL | Identify people in a room |
| Account link | Provider name and Discord account ID | Reconnect the same Discord account |
| Session | Opaque session token, user ID, expiration | Keep the user signed in |
| Room | Internal/public IDs, short code, invite hash, owner, optional name, access mode and lifecycle timestamps | Resolve rooms and enforce access |
| Membership | Room/user IDs, owner/member role, approval and revocation timestamps | Keep permission independent from online presence |
| Join request | Room/user IDs, status and resolution timestamps | Let the owner approve or reject access |

Discord OAuth access, refresh and ID tokens are discarded before the account link is written. The app asks Discord only for the `identify` scope, so email is not requested. Session lifetime is limited to seven days and refreshed at most once per day.

The database does **not** store screen frames, video, audio, screenshots, files, clipboard contents, process names, window titles, SDP, ICE candidates, IP addresses, quality statistics or stream history.

## Ephemeral signaling

Upstash Redis temporarily holds presence, active-stream announcements and WebRTC negotiation messages. SDP and ICE candidates can contain network information. JanjaLive sets a 180-second TTL and keeps at most 400 recent events per room. These values are never copied to PostgreSQL or application logs.

Upstash is still an infrastructure provider that receives the signaling requests. Its own operational logs, backups and legal retention are governed by the selected Upstash plan and agreement, not by this repository. Production setup must use a private database, scoped credentials and the shortest provider retention available.

## Screen capture

The only capture API used by the application is `navigator.mediaDevices.getDisplayMedia()`. It is called after the user presses **Compartilhar tela**. The browser and operating system show their native picker, and JanjaLive receives only the `MediaStream` returned for the selected screen, window or tab.

The application does not call `getUserMedia`, camera APIs, microphone APIs, file pickers, directory APIs, clipboard read APIs, process enumeration or native desktop capture APIs. The only clipboard operation is writing an invite link after an explicit user action. Camera and microphone permissions are disabled by the site Permissions Policy.

System or tab audio is requested with the display picker and exists only when the browser returns an audio track. JanjaLive never captures microphone audio.

## Media path

Media tracks are attached directly to browser `RTCPeerConnection` instances only after a viewer chooses **Assistir**. Vercel, Neon and Upstash do not receive or store media frames.

When TURN is configured and a direct route cannot be established, Cloudflare may relay encrypted WebRTC packets. A relay can observe connection metadata and traffic volume, but WebRTC media remains encrypted in transit. TURN credentials are short-lived, limited to one hour and issued only to an authenticated, authorized room member.

## Limits that cannot be removed

- An authorized viewer can record the screen with software or another device. JanjaLive cannot prevent that.
- WebRTC participants and STUN/TURN infrastructure can observe network metadata during connection establishment. Raw peer addresses are never displayed in the JanjaLive UI or intentionally logged by the app.
- Vercel, Neon, Upstash, Cloudflare and Discord can observe the metadata necessary to provide their services. Their platform-level logging and retention must be reviewed in the production account.
- Browser extensions, malware or a compromised operating system are outside the web application's security boundary.

## Production checklist

- Keep the GitHub repository, Neon database and Upstash database private.
- Use separate scoped credentials for production and preview, and rotate them after any suspected exposure.
- Never place server secrets in variables prefixed with `NEXT_PUBLIC_`.
- Configure `AUTH_URL=https://janja.live` and the exact Discord callback `https://janja.live/api/auth/callback/discord`.
- Enable MFA on GitHub, Vercel, Discord, Neon, Upstash and Cloudflare accounts.
- Review provider access logs and retention settings before inviting real users.
- Do not enable request-body logging, session replay, analytics pixels or error-reporting tools that capture application payloads.
- Run the manual two-browser privacy checklist in `docs/manual-webrtc-test.md` before production use.
