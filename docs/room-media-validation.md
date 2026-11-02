# Room media polish: local validation

Validation date: 2026-11-01. Windows build 26200, Electron 44.9.1. These are local results, not a production rollout or a guarantee for every device/network.

## Behavior

- Approval/rejection/revocation now also emits an untargeted `room:members-changed` notification. Only the affected member receives the access-changing event. Other participants refresh their roster, and presence changes also refresh profiles without a new continuous HTTP polling loop.
- Disconnecting a member sends a presence snapshot immediately, without waiting for the WebSocket close handshake. Closing the client transport invalidates it synchronously and clears retained events; completed polls from an old hook effect cannot revoke the new session.
- Monitor sharing offers **Excluir áudio de uma aplicação**. Pick Discord (or another application's window), then the monitor. **Incluir todas** preserves ordinary system audio. This option does not affect application sharing, whose audio already comes from that application's process tree. Excluding a browser excludes its process tree, not an individual Discord tab.
- An invalid/unsupported exclusion fails to video only. If the excluded process exits, native audio ends; the user must select the application again after restarting it. No unrestricted system-audio fallback is used.
- Clicking another transmitting member adds a player instead of closing the existing one. Each player has independent volume, fit, PiP, fullscreen and stop controls. Additional players start muted; enable their audio explicitly. Closing one remote stream leaves the others and the local broadcast running.
- The broadcaster's preview shows a viewer count. Hover/focus or tap reveals names. Counts come from unique **connected outbound peers**, not pending watch requests, and do not require an extra server query. Other viewers do not receive this private list through a new broadcast protocol.

## Research

- [Microsoft application loopback capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/): include/exclude process trees, Windows build 20348+.
- [WebRTC specification](https://www.w3.org/TR/webrtc/): independent peer/track lifecycles and explicit connection teardown.
- [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): per-socket attachments and presence snapshots.
- [React effect cleanup](https://react.dev/learn/synchronizing-with-effects): ignore responses belonging to an old effect.

## Executed checks

- Final automated result: 153 web/shared/Worker tests and 30 desktop tests passed; root and desktop/Worker TypeScript checks passed, along with ESLint and `git diff --check`.
- Unit/component tests cover stale revoked polls after reentry, clearing retained transport events, concurrent initial session lookup, targeted versus roster notifications, audio-selection contracts, two independent players, touch controls and audience updates.
- Real local Durable Object runtime (Wrangler/workerd), three sockets: three revoke/restore cycles passed. Only the target disconnected, observers received roster updates and an immediate offline snapshot, and an older revocation arriving after approval did not disconnect the restored session. The first harness incorrectly waited for the full local-proxy close handshake; the final assertion checks receipt of revocation and loss of the OPEN state, followed by the client's teardown.
- Real Electron WebRTC, synthetic 1280x720/30 FPS video plus independent audio sources: compared the committed core at `0dcfec0` with the working core. Single-stream final resolution was 1280x720 in both; measured ~30 FPS, no dropped frames or lost packets in the measured interval, and nonzero received audio. With two connections, both continued receiving; closing A preserved B and updated A/B's audience independently.
- Chromium adapted the newly added stream's resolution during bandwidth ramp-up in **both** versions. This test does not establish a fixed-resolution guarantee, gaming input latency, WAN/TURN performance or CPU/memory equivalence on weaker hardware. No encoder bitrate, codec selection or production quality preset was reduced for these features.
- At a 390x750 viewport there was no horizontal overflow. After revealing both players' controls, hit testing reached all ten actual control buttons. Enabling the second player's audio, fullscreen and closing just one stream passed. Screenshots exercise production web player/CSS; they are controlled fixtures, not a physical-phone acceptance test.
- Native WASAPI test: two separate Win32 waveOut processes generated 997 Hz and 1999 Hz. System mode contained both, application mode isolated its source, and exclusion suppressed the chosen tone by ~40 dB in the final controlled run while preserving ~98.4% of the other tone's measured amplitude. Format remained 48 kHz, stereo, PCM16. An invalid window emitted no PCM; killing the excluded process ended capture in ~621 ms rather than exposing the system mix. Earlier SoundPlayer/concurrent trials did not consistently meet the isolation threshold; the final controlled fixture uses separate native renderers. This is not a listening test of a live Discord call.
- Web production build, desktop build, native helper compilation and Worker typecheck/dry-run passed. The local NSIS candidate is checked for packaged dependencies, native helper, fuses and renderer/preload startup. No production migration is run by these validation commands.

Local harnesses and raw results/screenshots are in ignored `.tooling/room-qa/`: `worker.cjs`, `run.cjs`, `native-audio.cjs`, `*-results.json`, and PNG captures. They use local-only synthetic credentials and task-owned processes, and consume no production room/TURN quota. No paid service or plan setting was added.

The rebuilt local candidate is `apps/desktop/dist/JanjaLive-Setup-0.1.29.exe`. Its final package verification and renderer/preload startup smoke test passed after the excluded-process lifetime protection was compiled. Actual desktop component fixtures also confirmed the picker stayed within the window, the selected exclusion read “Sem áudio de: Discord”, and the preview's count opened the connected viewer's name. This candidate remains the ordinary unsigned EXE channel; the earlier Store package was not rebuilt by this validation pass.

## Release and real-device acceptance

No new environment variable is required by this polish. Publish the Worker before the web/client so the new roster event is accepted, then distribute the rebuilt desktop. This document does not mean these changes have already been pushed or deployed.

After deployment, confirm with two real accounts/devices: revoke and reapprove; observe names/presence on both sides; transmit monitor + Discord excluded while another application plays; restart the excluded application and confirm audio stops; transmit an application normally; watch two live sources, adjust each audio, exit one, and inspect the broadcaster's audience by hover/tap. Test desktop-to-web and web-to-desktop on the networks actually used. Multilive necessarily increases bandwidth and decoding work, and TURN usage when relay is required; no finite local test can promise zero impact on every configuration.
