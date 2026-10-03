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
- [x] Electron fuses are applied to the packaged executable
- [x] ASAR integrity and load-only-from-ASAR fuses are enabled
- [x] extra `file://` protocol privileges are disabled
- [x] the packaged executable reaches the mounted local renderer in the release smoke test
- [x] capture requires an explicit, expiring, one-use source selection
- [x] the renderer cannot submit an Electron source ID
- [x] video frames never cross IPC
- [x] updater provider is fixed and cannot be overridden by the renderer
- [x] desktop OAuth handoff is single-use, short-lived, state-bound and PKCE-bound
- [x] desktop credential is encrypted with `safeStorage` without plaintext fallback
- [x] logout is unavailable during capture and clears room, peers and the local/server credential when used
- [x] no backend or Discord secret exists in the bundle
- [x] no GitHub token exists in the bundle
- [x] sensitive logs are absent in packaged application code
- [ ] signed update manifest verification is enabled after stable builder support
- [ ] Windows Authenticode certificate is configured when budget permits
- [x] dependency audit has been reviewed
- [x] CI and release workflows run a full-history Gitleaks scan
- [ ] desktop-to-web, web-to-desktop and desktop-to-desktop media tests pass
- [ ] 720p30, 720p60, 1080p60, 1440p60 and system-audio tests pass
- [ ] revocation, reconnect, sleep/resume, app close and network interruption tests pass
