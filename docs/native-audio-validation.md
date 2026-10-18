# Native Windows audio validation

This document records engineering evidence for the native desktop-audio path. It is intentionally separate from the manual release gate: a release is not approved until a second client actually hears the audio through WebRTC.

## Architecture under test

1. Electron main owns the opaque source grant and the original `DesktopCapturerSource`.
2. Application mode derives the HWND from that main-owned source; the native helper validates the window and asks Windows for its owning PID.
3. The helper captures the target process tree with WASAPI process loopback. Monitor mode captures the current default render endpoint.
4. The helper writes a fixed binary protocol to inherited stdout: a 12-byte bounded frame header followed by one format frame or 16-bit PCM frames.
5. Electron main parses and bounds-checks every frame, then sends PCM on one session-scoped `MessagePort` directly into an `AudioWorklet`.
6. The worklet converts interleaved PCM to Web Audio samples. `MediaStreamAudioDestinationNode` produces the audio track added to the existing display `MediaStream` before WebRTC starts or replaces the broadcast.

No audio is written to disk or sent through the application backend. The helper has no network server and exits on stdin EOF.

## Automated and local evidence — 2026-10-17

Environment: Windows build 26200, x64, native helper compiled with the installed MSVC and Windows SDK.

- Native compilation passes with warnings treated as errors.
- The PE is x64 with ASLR/high-entropy VA, DEP/NX, CET compatibility and Control Flow Guard instrumentation.
- System-loopback activation emits the expected `JNJA` version 1 format frame: 48 kHz, stereo, signed 16-bit PCM.
- Process-loopback activation emits the same format and exits cleanly when stdin closes.
- A generated 440 Hz target process produced non-silent process-loopback PCM (`peak 2788`, `RMS 1883` in one smoke run).
- Isolation smoke test played 440 Hz in the selected process and 880 Hz in an unrelated process. Process mode measured amplitudes `1251` versus `1`, while system mode measured both tones (`1134` and `1392`). This proves the native application mode excludes the unrelated process in the tested environment.
- An Electron AudioWorklet smoke test converted framed PCM into a live `MediaStreamTrack`; analyser RMS was `0.2600`.
- The packaged app contains the helper under `app.asar.unpacked`, passes ASAR/content verification, preserves all nine Electron fuses and mounts the packaged renderer successfully.
- The release build compiles the helper from checked-in source. Electron-builder discovers the unpacked helper as a signable `.exe`; signature verification covers the main executable, helper and installer whenever signing is configured.

## Still required before release

- Desktop broadcaster → desktop viewer: receiver audibly hears application audio.
- Desktop broadcaster → web viewer: receiver audibly hears application audio.
- Cancel, source switch, selected-app exit, default-device change, viewer mute/volume, stop share, app quit and updater lifecycle checks.
- Duplicate-audio, echo, ghost-track and 1080p60 regression checks.

Until those checks pass, native audio is implemented and locally validated but not release-qualified.
