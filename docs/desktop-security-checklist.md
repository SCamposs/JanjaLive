# Desktop release security checklist

Checked items are implemented in source. All items must be checked again against the packaged artifact before a release.

- [x] `nodeIntegration` is false
- [x] `contextIsolation` is true
- [x] `sandbox` is true
- [x] `webSecurity` is true
- [x] production CSP is restrictive and contains no `unsafe-eval`
- [x] navigation is blocked outside the local renderer
- [x] new windows are blocked
- [x] IPC sender and top frame are validated
- [x] IPC payload schemas reject unknown fields
- [x] raw `ipcRenderer` is not exposed
- [x] Electron fuses are applied and re-read from the packaged executable before release
- [x] ASAR integrity and load-only-from-ASAR fuses are enabled
- [x] packaged ASAR contains required runtime files and rejects environment files, credentials, certificates, source maps and renderer-only dependencies
- [x] extra `file://` protocol privileges are disabled
- [x] update metadata version, installer path, size and SHA-512 are checked against the generated files
- [x] the packaged executable reaches the mounted local renderer in the release smoke test
- [x] capture requires an explicit, expiring, one-use source selection
- [x] the renderer cannot submit an Electron source ID
- [x] video frames never cross IPC
- [x] renderer cannot submit a PID or HWND for native audio capture
- [x] native audio helper has fixed modes, inherited pipes, bounded binary frames, no network server, no persistence and no elevation
- [x] helper build comes from checked-in source during Windows release CI
- [x] packaged-content verification requires the helper executable outside ASAR
- [x] updater install stops the helper before quitting
- [x] updater provider is fixed and cannot be overridden by the renderer
- [x] an installed older client discovers and downloads a newer GitHub release whose SHA-512 matches its updater metadata
- [ ] restart-and-install updates an installed client and relaunches the new version
- [x] desktop OAuth handoff is single-use, short-lived, state-bound and PKCE-bound
- [x] desktop credential is encrypted with `safeStorage` without plaintext fallback
- [x] logout is unavailable during capture and clears room, peers and the local/server credential when used
- [x] no backend or Discord secret exists in the bundle
- [x] no GitHub token exists in the bundle
- [x] sensitive logs are absent in packaged application code
- [ ] signed update manifest verification is enabled after stable builder support
- [ ] Windows Authenticode certificate is configured when budget permits; the release pipeline already signs and requires valid signatures when `WIN_CSC_LINK` is present
- [x] dependency audit has been reviewed
- [x] CI and release workflows run a full-history Gitleaks scan
- [ ] desktop-to-web, web-to-desktop and desktop-to-desktop media tests pass
- [ ] 720p30, 720p60, 1080p60, 1440p60, application-audio and system-audio tests pass
- [ ] revocation, reconnect, sleep/resume, app close and network interruption tests pass

## Dependency audit note (2026-10-26)

The growth-stage increment updates Next/config to 16.4.1, Electron to 44.9.1,
Zod to 4.6.6 and desktop Vite to 7.3.7. The test harness pins Vite 8.3.3 separately
so electron-vite's Vite 7 compatibility remains intact. Overrides keep Undici
6/7/8 and fast-uri on their patched major-compatible releases, including tooling.
The full lockfile audit reported no known vulnerabilities at validation time.
CI and release now fail on high/critical audit findings. This result is a package
advisory check, not proof of absence of application vulnerabilities. The Next
image advisory had an existing sharp mitigation, and no use-cache typed-array
path was found; we do not claim an RCE was reproduced in JanjaLive.
