import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { app, MessageChannelMain, type DesktopCapturerSource, type WebContents } from "electron";
import type { NativeAudioMode, NativeAudioStartResult } from "../shared/contracts";
import { NativeAudioProtocolParser, parseWindowHandle } from "./native-audio-protocol";

const START_TIMEOUT_MS = 8_000;
const STOP_TIMEOUT_MS = 1_000;

type NativeAudioSession = {
  ownerId: number;
  child: ChildProcessWithoutNullStreams;
  closePort(): void;
};

function helperPath() {
  return app.isPackaged
    ? resolve(process.resourcesPath, "app.asar.unpacked", "native", "audio-helper", "bin", "janjalive-audio-helper.exe")
    : resolve(app.getAppPath(), "native", "audio-helper", "bin", "janjalive-audio-helper.exe");
}

function unavailableReason(exitCode: number | null): Extract<NativeAudioStartResult, { status: "unavailable" }>["reason"] {
  if (exitCode === 3) return "unsupported-windows";
  if (exitCode === 4) return "source-ended";
  return "capture-failed";
}

export class NativeAudioManager {
  private sessions = new Map<string, NativeAudioSession>();

  async start(ownerId: number, source: DesktopCapturerSource, mode: Exclude<NativeAudioMode, "none">, target: WebContents): Promise<NativeAudioStartResult> {
    if (process.platform !== "win32") return { status: "unavailable", reason: "unsupported-platform" };

    const executable = helperPath();
    if (!existsSync(executable)) return { status: "unavailable", reason: "helper-unavailable" };

    let args: string[];
    if (mode === "application") {
      const handle = parseWindowHandle(source.id);
      if (!handle) return { status: "unavailable", reason: "source-ended" };
      args = ["--window-handle", handle];
    } else {
      if (!source.id.startsWith("screen:")) return { status: "unavailable", reason: "capture-failed" };
      args = ["--system"];
    }

    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        NODE_ENV: process.env.NODE_ENV ?? "production",
        SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
        WINDIR: process.env.WINDIR ?? "C:\\Windows",
      },
    }) as ChildProcessWithoutNullStreams;
    const parser = new NativeAudioProtocolParser();
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { ownerId, child, closePort: () => undefined });

    return await new Promise<NativeAudioStartResult>((resolveStart) => {
      let settled = false;
      let audioPort: Electron.MessagePortMain | null = null;
      const settle = (result: NativeAudioStartResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveStart(result);
      };
      const stopChild = () => {
        if (!child.killed) child.kill();
      };
      const timeout = setTimeout(() => {
        settle({ status: "unavailable", reason: "capture-failed" });
        stopChild();
      }, START_TIMEOUT_MS);

      child.stderr.on("data", () => undefined);
      child.stdout.on("data", (chunk: Buffer) => {
        try {
          for (const frame of parser.push(chunk)) {
            if (frame.type === "format") {
              if (audioPort) throw new Error("NATIVE_AUDIO_DUPLICATE_FORMAT");
              if (this.sessions.get(sessionId)?.child !== child) {
                stopChild();
                return;
              }
              const { port1, port2 } = new MessageChannelMain();
              audioPort = port1;
              target.postMessage("capture:native-audio-port", { sessionId }, [port2]);
              this.sessions.set(sessionId, {
                ownerId,
                child,
                closePort: () => {
                  try { port1.postMessage({ type: "ended" }); } catch {}
                  port1.close();
                },
              });
              settle({
                status: "started",
                sessionId,
                mode,
                sampleRate: frame.sampleRate,
                channels: frame.channels,
                bitsPerSample: frame.bitsPerSample,
              });
            } else if (audioPort) {
              const data = frame.payload.buffer.slice(
                frame.payload.byteOffset,
                frame.payload.byteOffset + frame.payload.byteLength,
              );
              audioPort.postMessage({ type: "pcm", data });
            }
          }
        } catch {
          settle({ status: "unavailable", reason: "capture-failed" });
          stopChild();
        }
      });
      child.once("error", () => {
        settle({ status: "unavailable", reason: "helper-unavailable" });
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        const active = this.sessions.get(sessionId);
        if (active?.child === child) {
          active.closePort();
          this.sessions.delete(sessionId);
        }
        if (!settled) settle({ status: "unavailable", reason: unavailableReason(code) });
      });
    });
  }

  async stop(ownerId: number, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) return;
    this.sessions.delete(sessionId);
    session.closePort();
    if (session.child.exitCode !== null || session.child.killed) return;
    session.child.stdin.end();
    await new Promise<void>((resolveStop) => {
      const timeout = setTimeout(() => {
        if (session.child.exitCode === null && !session.child.killed) session.child.kill();
        resolveStop();
      }, STOP_TIMEOUT_MS);
      session.child.once("close", () => {
        clearTimeout(timeout);
        resolveStop();
      });
    });
  }

  async stopOwner(ownerId: number) {
    const sessionIds = [...this.sessions]
      .filter(([, session]) => session.ownerId === ownerId)
      .map(([sessionId]) => sessionId);
    await Promise.all(sessionIds.map((sessionId) => this.stop(ownerId, sessionId)));
  }

  async stopAll() {
    await Promise.all([...this.sessions].map(([sessionId, session]) => this.stop(session.ownerId, sessionId)));
  }
}
