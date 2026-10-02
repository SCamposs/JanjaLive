# JanjaLive

## Product

JanjaLive is a small, private screen-sharing utility for trusted groups of friends. A user signs in with Discord, opens or joins a room, chooses a screen or window, selects an understandable quality preset, and shares it directly with the people watching.

## Users

- Friends who want to watch a game, creative work, or troubleshooting session together.
- Room owners who need simple control over who may enter and who remains authorized.
- Viewers who should be able to start watching without learning WebRTC terminology.

## Core experience

Open room, choose screen, choose quality, share, friends watch.

The shared screen is always the visual priority. Presence and permission remain separate concepts: an authorized member stays visible even while offline. Pending access requests are prominent without interrupting the room with a modal.

## Personality

- Dark-first and neutral.
- Restrained, calm, compact, and practical.
- Subtle violet/periwinkle accent used for actions and state.
- Product utility, not startup marketing.
- Desktop-first, responsive, and understandable to normal users.

## Anti-references

- Do not make the product resemble a network debugger or developer dashboard.
- Do not expose RTT, packet loss, jitter, codec, ICE, transport, SRTP, topology, sockets, or protocol internals in the main UI.
- Do not make claims such as zero relay, direct P2P, or codec-specific encryption unless the application can prove them and the user needs the information.
- Do not copy arbitrary technical text from visual mockups.
- Do not turn the landing page into a broad marketing site or the room into a Discord clone.

## Content rules

- Use plain Portuguese and short, action-oriented labels.
- Explain privacy in human terms: only the selected screen or window is shared; JanjaLive does not record the stream.
- Show only information that helps a user decide or recover: stream owner, live state, resolution, FPS, audio availability, and simple connection health.
- Bitrate belongs only in stream configuration when it helps estimate quality or when Custom quality is selected.

## Accessibility and interaction

- Meet WCAG AA contrast for text and controls.
- Keep visible keyboard focus, semantic labels, disabled and loading states, and keyboard-operable dialogs.
- Honor reduced-motion preferences.
- Keep player controls minimal: volume, mute, Picture in Picture, fullscreen, and stop watching.

## Design register

`product`
