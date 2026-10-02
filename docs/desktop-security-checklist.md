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
- [x] capture requires an explicit, expiring, one-use source selection
- [x] the renderer cannot submit an Electron source ID
- [x] video frames never cross IPC
- [x] updater provider is fixed and cannot be overridden by the renderer
- [x] desktop OAuth handoff is single-use, short-lived, state-bound and PKCE-bound
- [x] desktop credential is encrypted with `safeStorage` without plaintext fallback
- [ ] logout clears local credential, media and peers
- [ ] no backend or Discord secret exists in the bundle
- [ ] no GitHub token exists in the bundle
- [ ] sensitive logs are absent in packaged behavior
- [ ] signed update manifest verification is enabled after stable builder support
- [ ] Windows Authenticode certificate is configured when budget permits
- [ ] dependency audit has been reviewed
- [ ] repository and history secret scan passes
- [ ] desktop-to-web, web-to-desktop and desktop-to-desktop media tests pass
- [ ] 720p30, 720p60, 1080p60, 1440p60 and system-audio tests pass
- [ ] revocation, reconnect, sleep/resume, app close and network interruption tests pass
