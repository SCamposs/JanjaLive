# Product benchmark for v0.1

Reviewed on 2 October 2026. This is a product comparison, not a feature checklist. JanjaLive remains a private screen-sharing utility for recurring groups of friends.

| Product | What it solves well | Lesson for JanjaLive | Decision |
|---|---|---|---|
| [Sharry](https://sharry.live/) | Very short first-session path: create, send a link, select a screen | First-time invitation should remain understandable and room entry should not expose networking concepts | Keep invite/code entry secondary to saved rooms; do not remove Discord identity or persistent membership |
| [Screego](https://github.com/screego/server) | Stays narrowly focused on high-quality, low-latency screen sharing alongside an existing call app | A dedicated utility is clearer when it refuses chat, voice, recording and collaboration clutter | Preserve the narrow scope and human-readable connection errors |
| [VibeScreen](https://github.com/aemal/vibescreen) | Lets the player fill the viewport and hides controls when they are not needed | The watching surface should dominate after a stream is selected | Keep hover/focus player controls and one selected stream; do not adopt its automatic side-by-side layout |
| [Serenada](https://github.com/agatx/serenada) | Recent/saved rooms reduce repeat-use friction; signaling has a fallback-oriented reliability mindset | Recurring access is more valuable here than anonymous one-off rooms | Keep the authenticated room list, membership distinct from presence, backoff/recovery and easy re-entry |
| [ScreenLink](https://github.com/blyncnov/screen-link) | Documents concrete stop, refresh, disconnect and TURN-fallback behavior | Failure handling should be defined in user-visible outcomes, not protocol messages | Maintain explicit stop/end handling, stale presence expiry and simple reconnect states |

## Conclusions applied to v0.1

- The returning path is **open JanjaLive → open a saved room → share**.
- Desktop earns its place through its source picker, system-audio path, deep links and updater—not by wrapping the website.
- Available streams live in the main stage and connect only after **Assistir**.
- The player uses minimal controls that fade until hover or keyboard focus.
- Membership remains persistent while online presence and LIVE state remain temporary.
- The interface says **Reconectando**, **Conexão instável** or **Não foi possível conectar**, never ICE/SDP/codec diagnostics.
- Audio failure falls back to video instead of failing the share.

## Deliberate non-adoptions

Accountless rooms would weaken recurring membership; automatic multi-stream grids would consume bandwidth and attention; voice, chat, camera, recording, reactions and public discovery would dilute the product. They remain out of scope even where a benchmark offers them.
