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
- [ ] 720p30, 720p60, 1080p60, 1440p60 and system-audio tests pass
- [ ] revocation, reconnect, sleep/resume, app close and network interruption tests pass

## Dependency audit note

The 2026-10-04 audit found `http-cache-semantics` in the desktop packaging toolchain and `braces` in the Next.js lint toolchain. The published `http-cache-semantics@4.3.0` fix is pinned at the workspace root. The remaining `braces` advisory affects development-time glob matching through `eslint-config-next`; the registry still exposes `3.0.3` as the newest release even though the advisory names `3.0.4` as the first patched version. It has no runtime path into the web or packaged desktop application and must be revisited when a patched upstream release exists.
