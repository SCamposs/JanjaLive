# JanjaLive Windows audio helper

This small helper captures PCM audio through Windows Audio Session API (WASAPI). It supports two explicit modes:

- a selected window's owning process tree, resolved from a main-process-owned `DesktopCapturerSource` window handle;
- the current default render endpoint for an explicitly selected monitor share.

It accepts only one fixed mode argument, writes a bounded binary PCM protocol to standard output, and stops when its inherited standard-input pipe closes. It does not open a network socket, write captured audio to disk, require elevation, install a driver or expose a command interpreter.

Process-loopback mode requires Windows build 20348 or newer. Unsupported systems fail closed and the Electron client continues with video only.

Build locally from the desktop package with:

```powershell
pnpm build:native-audio
```

The implementation is original JanjaLive code based on the public Windows SDK contracts. Microsoft's Application Loopback sample was used as an API and architecture reference; no sample source is vendored here.
