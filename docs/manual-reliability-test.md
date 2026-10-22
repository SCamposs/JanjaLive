# Realtime reliability release gate

Use two different JanjaLive accounts and keep Cloudflare Durable Objects as the active provider. Do not approve a desktop release from a short smoke test.

## Soak and reconnect

1. Start one desktop broadcast with application audio and watch it from the web for at least 45 minutes.
2. While media is playing, briefly interrupt only the realtime connection (for example, a short network transition), then restore it.
3. Confirm local capture remains active, the viewer does not need to reopen the stream, presence returns, and audio is not duplicated.
4. End the broadcast explicitly and confirm the viewer exits immediately rather than waiting for the snapshot grace period.
5. Repeat with system audio and then with web as broadcaster.

The temporary `[JanjaLive media]` console timeline contains only state names, elapsed time, peer direction/state, counts, track kind, close code, and booleans. It must not contain user IDs, room IDs, SDP, ICE candidates, IPs, tokens, credentials, or media data.

## Simultaneous send and receive

1. A and B both start broadcasting.
2. A watches B and B watches A.
3. Confirm both local broadcasts and both remote streams remain active with audio.
4. A stops watching B; B must continue receiving A.
5. A stops broadcasting; A's independent watch of B must remain active until A explicitly stops it.
6. Repeat the order in reverse.

## Interoperability matrix

Run at least one successful start, five-minute playback, explicit stop, and re-entry for each direction:

- Web to Web
- Desktop to Web
- Web to Desktop
- Desktop to Desktop

For desktop broadcasting, test application audio and system audio separately. Confirm stopping or replacing a shared source terminates the native helper and does not leave a ghost audio track or process.

## Administration

1. Open `/admin` signed out and with an ordinary user: both must get a minimal 404.
2. Confirm only the owner receives the shield shortcut in the web header; it must be absent from ordinary-user HTML and from the desktop client.
3. As owner, search by name, internal ID, and Discord ID.
4. Ban a disposable test account while it has a web socket and a desktop session. It must disconnect and fail room, realtime, and TURN access.
5. Keep a realtime token obtained immediately before the ban and verify that it cannot reconnect afterward, even before its original 60-second expiry.
6. Confirm the owner cannot ban themselves.
7. Repeat ban, then unban twice. Audit entries must only represent actual state changes; revocation is retried for repeated bans. Old web/desktop sessions remain invalid, while a newly issued realtime token connects after unban.

## Signaling abuse bounds

1. Unsolicited ICE with unknown session IDs must not create peer connections.
2. Repeated watch retries with the same session must remain idempotent.
3. A sender that exceeds the concurrent-session or signaling budget must be dropped without interrupting legitimate peers in the room.
