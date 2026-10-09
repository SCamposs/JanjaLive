# Manual WebRTC test plan

Use Chrome or Edge on Windows first. Never paste production secrets into screenshots, bug reports, or browser logs.

## Automated coverage before this plan

CI verifies that web and desktop accept the same signaling fixtures, both consume the same shared WebRTC core, reconnect backoff is bounded, room close/revocation ends polling, and leaving a room stops all local capture tracks. These tests protect protocol and lifecycle behavior but do not replace the real devices, networks, browser pickers, system-audio paths and operating-system transitions below.

## Setup

- Configure Discord OAuth, Neon, and Upstash variables.
- Apply the checked-in Drizzle migration.
- Register the correct Discord callback URL.
- Open DevTools only to verify that media requests are peer connections; do not copy raw SDP, ICE candidates, cookies, or IP addresses.
- Record the exact browser and desktop versions before each run. Desktop regression testing for the stale-negotiation fix starts at `0.1.20`.

## Regression gate — desktop 0.1.20

Run this short gate before the broader matrix. It specifically covers failures observed in `0.1.19`.

- [ ] Enter an authorized room in the desktop app. The status begins as **Conectando** and clears after the first successful room sync; it must not begin as **Reconectando**.
- [ ] Start and stop one viewing attempt, leave the room, then reopen it within three minutes. Old offers and ICE candidates must not recreate a peer or hold the room in a connection state.
- [ ] Start a browser transmission, click **Assistir** in desktop, and confirm video/audio arrive without the former 20-second failure.
- [ ] Start a desktop transmission and confirm a browser on another account can watch it.
- [ ] Repeat both directions on different networks so TURN is exercised when a direct route is unavailable.
- [ ] With a viewer connected, use **Trocar tela**. The viewer must remain connected and begin receiving the new source without clicking **Assistir** again.
- [ ] With two friends transmitting, switch between them from the play buttons in the members panel. The previous peer must close and the selected stream must open.
- [ ] At browser zoom 100%, confirm the player controls are visible without F11, scrolling, or pointer hover.
- [ ] Confirm the short start/join/leave sounds are quiet, distinct, and never block an action if browser autoplay policy suspends audio.

## Test A — two browser sessions, one computer

- Open a normal window and an incognito/alternate browser profile.
- Sign in with two Discord accounts.
- Create an approval-required room, send the invite, request access, approve it, and confirm entry without a full reload.
- Confirm the approved member remains under **Autorizados** after closing their browser.

## Test B — two computers, same network

- Repeat the full join flow on two computers connected to the same network.
- Share a tab, a window, and an entire screen one at a time.
- Confirm the local preview matches the exact browser-selected source.

## Test C — two computers, different networks

- Put each computer on a different home/office network.
- Start at 720p30, then 720p60 and 1080p60.
- Confirm the viewer receives media only after clicking **Assistir**.
- Stop watching and verify the viewer connection closes while the broadcaster stays live.

## Test D — tethering / 4G / 5G

- Place one computer behind phone tethering and the other on a fixed network.
- Test without TURN first. If a direct connection cannot be established, confirm the UI says so clearly.
- Configure TURN for the production test and repeat across different networks to validate fallback.

## Capture and quality checklist

- [ ] Browser picker opens only after a user click.
- [ ] Canceling the picker or preview leaves no active track.
- [ ] 720p30 works.
- [ ] 720p60 works.
- [ ] 1080p30 works.
- [ ] 1080p60 works.
- [ ] 1440p30 works when the source supports it.
- [ ] 1440p60 works when the source and hardware support it.
- [ ] Source mode does not upscale.
- [ ] Auto, High, and Custom quality are accepted without breaking playback.
- [ ] System audio says active only when an audio track exists.
- [ ] Native **Stop sharing** immediately removes the live card.

## Room and lifecycle checklist

- [ ] Discord login gate works.
- [ ] Approval and invite modes behave as described.
- [ ] Pending request appears without a modal.
- [ ] Approve and reject update the visitor state.
- [ ] Revoke removes room access and related peer connections.
- [ ] Offline authorization remains visible.
- [ ] Regenerating the invite invalidates the old link.
- [ ] Closing the room prevents later access.
- [ ] Two or more authorized members can broadcast simultaneously.
- [ ] No stream starts downloading before **Assistir**.

## Viewer controls

- [ ] Volume and mute work.
- [ ] Picture in Picture works when the browser exposes it.
- [ ] Fullscreen works.
- [ ] **Parar de assistir** closes the selected peer connection.
- [ ] Switching to another broadcaster from the members panel closes the previous peer connection.
- [ ] Controls remain reachable at 100% browser zoom and at common laptop viewport heights.

## Desktop update

- [ ] An installed older build detects `0.1.20` or newer without a manual update button.
- [ ] Accepting the update restarts the application.
- [ ] After relaunch, the title bar and in-app version both show the new version.
- [ ] Authentication and the saved room list remain available after the update.

## Resilience

- [ ] Temporarily block the signaling endpoint, then restore it.
- [ ] UI moves from **Reconectando** back to **Conectado**.
- [ ] An already established stream survives a temporary signaling interruption when the peer path remains available.
- [ ] Viewer join/leave and broadcaster stop are reflected after resync.

## Privacy verification

- [ ] No media request body reaches Vercel, Neon, or Redis.
- [ ] PostgreSQL contains no SDP, ICE candidates, stats, IPs, frames, audio, or screenshots.
- [ ] Production logs contain no invite token, OAuth token, SDP, ICE candidate, cookie, or raw IP.
