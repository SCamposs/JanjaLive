# JanjaLive Desktop security

This document describes the intended trust boundaries and the controls already present in the Electron client. It is not a claim that the desktop release is risk-free.

## Trust model

The packaged renderer is local code. It never loads `https://janja.live` as its application document. Remote JanjaLive responses, room members, deep links, capture source names and signaling payloads are untrusted input.

The renderer is assumed to be compromisable through a future UI bug. A renderer compromise must not grant Node.js, filesystem, shell, raw IPC, updater configuration or arbitrary screen-capture access. The main process and the operating system remain the native trust boundary.

## Electron boundary

- `nodeIntegration` is disabled.
- `contextIsolation`, Chromium sandboxing and `webSecurity` are enabled.
- The preload exposes named methods only. Raw `ipcRenderer` is never returned.
- Every IPC handler checks the exact top-level renderer frame and validates payloads.
- Production navigation and network requests are allowlisted. New windows are denied.
- Camera, microphone, geolocation, notifications, MIDI, USB, serial and Bluetooth permissions are denied by default.
- Production code is packaged in ASAR. Electron fuses disable RunAsNode, Node CLI inspection and `NODE_OPTIONS`, enable cookie encryption and ASAR integrity, and require loading from ASAR.

## Screen capture

`desktopCapturer` runs only in the main process. A source list gives the renderer a short-lived random token, sanitized name, type and thumbnail—not the persistent Electron source ID. Selecting a token creates a one-use grant tied to the current `webContents`; `getDisplayMedia` consumes it within 30 seconds. Missing, expired, replayed or foreign grants are denied. No source is selected automatically.

Video and audio tracks stay inside Chromium. Frames never cross IPC and are never written to disk. Windows system audio uses Electron's supported `loopback` capture only when the user enables it.

## Deep links

Only these shapes are accepted:

- `janjalive://auth/callback?code=<opaque>&state=<opaque>`
- `janjalive://room/<opaque-room-token>`

The parser rejects unknown hosts, paths, parameters, fragments, credentials, ports, unsafe characters and oversized input. A single-instance lock forwards a validated link to the existing process. A deep link is data, never a command.

## Authentication boundary

Discord OAuth remains on `https://janja.live` in the system browser. No Discord client secret or backend secret belongs in the application. The handoff uses a five-minute single-use code, state and PKCE. The code, state and desktop credential are stored only as SHA-256 hashes by the backend. The permanent desktop credential stays in the main process and is encrypted with Electron `safeStorage`; the app refuses a plaintext fallback. The renderer receives only authentication state and user display data.

The backend consumes a grant with a conditional update before creating the session, so concurrent replay has a single winner. Expired and consumed grants, expired sessions and revoked sessions are removed by the authenticated maintenance job. End-to-end browser-to-app and concurrent-exchange tests remain release gates.

## Updater trust

The provider is fixed at the official `SCamposs/JanjaLive` GitHub Releases repository and cannot be supplied by the renderer. Downloads use `electron-updater`, HTTPS and the SHA-512 value in generated metadata. The renderer can only request a check or install an update already accepted by the updater.

Electron-builder 26.15.3 is the current stable `latest` release used here. Signed Ed25519 update manifests are documented for electron-builder 27, which is currently prerelease; this project does not adopt an alpha toolchain for production. Until a stable signed-manifest release is available, HTTPS/GitHub account security and artifact hashes protect the metadata path, but a compromised GitHub release channel remains a known risk. Windows Authenticode verification becomes effective after a future real code-signing certificate is configured. No fake certificate or verification bypass is used.

## Threats and mitigations

| Threat | Mitigation | Remaining risk |
|---|---|---|
| Malicious room invite or member | Backend authorization, schema limits, directed signaling | An authorized viewer can record shared content |
| Renderer XSS | Local bundle, strict CSP, sandbox, context isolation, narrow IPC | A same-origin UI compromise can perform allowed user-level operations |
| Compromised API response | Zod schemas, size limits, escaped React rendering | Logic flaws in accepted schemas remain possible |
| Malicious deep link | Strict parser, one-instance forwarding, state and PKCE design | OS protocol-handler interception must be considered during auth testing |
| Malicious external URL | Fixed destinations only; OAuth URL is constructed by the backend | A compromised system browser is outside the app boundary |
| Forged IPC | Exact sender/frame checks and strict schemas | Electron vulnerabilities are upstream risk |
| Leaked or replayed auth code | Short expiry, hash-at-rest, atomic single use, state and PKCE | End-to-end concurrent exchange remains to be exercised against staging |
| Tampered update or artifact | Fixed provider, HTTPS, SHA-512, future signed manifest and Authenticode | Stable builder currently lacks signed manifests; unsigned Windows builds show Unknown Publisher |
| Dependency compromise | Exact versions, pnpm lockfile, limited build-script allowlist, CI audit and secret scan | Registry or maintainer compromise before review |
| Accidental capture | Explicit source choice, preview, one-use grant, no persistence | The user can still select a sensitive window |
| Malicious source title | Control characters removed, length limited, React escaping | Thumbnail can contain sensitive screen content while picker is open |
| Signaling abuse | Authentication, membership checks, Zod schemas, rate limits and TTLs | P2P peers necessarily process negotiated WebRTC data |

## Logging

Desktop logs may contain application version, lifecycle and generic update/connection failures only. Never log tokens, cookies, auth codes, room invites, source IDs, window titles, file paths, SDP, ICE candidates, IP addresses or captured content.

## Release boundary

An unsigned Windows installer may trigger SmartScreen's “Unknown Publisher” warning. Users must not be instructed to disable Windows security. Production release also requires the checklist in `desktop-security-checklist.md`, a full secret scan and manual interoperability tests.
