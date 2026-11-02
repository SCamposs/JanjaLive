# JanjaLive Windows audio helper

This small helper captures PCM audio through Windows Audio Session API (WASAPI). It supports three explicit modes:

- a selected window's owning process tree, resolved from a main-process-owned `DesktopCapturerSource` window handle;
- the current default render endpoint for an explicitly selected monitor share.
- system audio excluding the process tree of an explicitly selected application's window, only for monitor sharing.

The exclusion uses `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`; it is not a Discord-name heuristic or a filter on recorded voices. The main process resolves both window handles from owner-scoped, expiring source tokens. It never accepts a renderer-supplied PID or command. If the excluded application exits, capture stops instead of switching to unrestricted system audio. A reopened application must be selected again. Unsupported/invalid exclusions continue with video only.

It accepts only one fixed mode argument, writes a bounded binary PCM protocol to standard output, and stops when its inherited standard-input pipe closes. It does not open a network socket, write captured audio to disk, require elevation, install a driver or expose a command interpreter.

Process-loopback mode requires Windows build 20348 or newer. Unsupported systems fail closed and the Electron client continues with video only.

Build locally from the desktop package with:

```powershell
pnpm build:native-audio
```

The implementation is original JanjaLive code based on the public Windows SDK contracts. Microsoft's Application Loopback sample was used as an API and architecture reference; no sample source is vendored here.
