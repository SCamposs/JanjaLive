# Desktop release process

Windows releases are built only by `.github/workflows/release.yml` after a semantic version tag reaches the main `SCamposs/JanjaLive` repository.

## Before tagging

1. Keep the root and `apps/desktop/package.json` versions equal.
2. Run `pnpm install --frozen-lockfile` and `pnpm check:all`.
3. Run `pnpm audit --audit-level moderate` and review every result.
4. Run a full-history Gitleaks scan plus a scan of current source and `apps/desktop/out`.
5. Build `pnpm desktop:package`; it re-reads all Electron fuses from the packaged executable and verifies the generated installer against the version, path, size and SHA-512 in `latest.yml`. Then verify the ASAR and the checklist in `desktop-security-checklist.md`.
6. Confirm the packaged-app smoke test reaches the mounted local renderer without an Electron error dialog.
7. Complete the manual interoperability matrix in `manual-webrtc-test.md`.

## Publish

Create and push a tag that exactly matches the desktop package version:

```text
git tag v0.1.0
git push origin v0.1.0
```

The tag workflow installs the frozen lockfile, scans the full history, runs all web and desktop checks, builds the x64 per-user NSIS installer, verifies the fuse wire and update artifacts, runs the packaged-app smoke test, and publishes the installer, block map and updater metadata to the matching GitHub Release. Only the publishing job receives `contents: write`; it does not receive signing, package, action or OIDC permissions.

## Update trust and signing

The updater provider is compiled as the official GitHub repository. Electron-builder 26.15.3 verifies the downloaded file against the SHA-512 value in `latest.yml`, but its stable line does not support signed Ed25519 manifests. The repository and GitHub account therefore remain part of the update trust boundary.

The v0.1 Windows build is intentionally unsigned because the project has no paid Authenticode certificate. Windows may display **Unknown Publisher**. Never tell users to disable SmartScreen. Add a real certificate later through GitHub Actions secrets; never commit it. Adopt signed update manifests after the feature reaches the stable electron-builder release used by the project.

`MINIMUM_DESKTOP_VERSION` is an optional emergency backend gate. Leave it unset normally. Setting it to a stable `x.y.z` version makes older or unidentified desktop clients receive HTTP 426 and show an update-required state.
