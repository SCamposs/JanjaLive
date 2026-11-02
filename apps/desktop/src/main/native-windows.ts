import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { nativeWindowSchema, assertSameWindow, waitForCaptureWindow, type NativeWindow } from "./capture-windows";

const execute = promisify(execFile);

export class NativeWindows {
  private helperPath() {
    return app.isPackaged
      ? resolve(process.resourcesPath, "app.asar.unpacked", "native", "window-helper", "bin", "janjalive-window-helper.exe")
      : resolve(app.getAppPath(), "native", "window-helper", "bin", "janjalive-window-helper.exe");
  }

  private async invoke(args: string[], signal?: AbortSignal): Promise<unknown> {
    const { stdout } = await execute(this.helperPath(), args, { windowsHide: true, timeout: 3_000, maxBuffer: 2 * 1024 * 1024, signal });
    return JSON.parse(stdout) as unknown;
  }

  async list(): Promise<NativeWindow[]> {
    if (process.platform !== "win32" || !existsSync(this.helperPath())) return [];
    return nativeWindowSchema.array().max(512).parse(await this.invoke(["--list"]));
  }

  async inspect(window: NativeWindow, signal?: AbortSignal) {
    const current = nativeWindowSchema.nullable().parse(await this.invoke(["--inspect", window.hwnd], signal));
    assertSameWindow(window, current);
    return current;
  }

  async prepare(window: NativeWindow, signal: AbortSignal) {
    const current = await this.inspect(window, signal);
    signal.throwIfAborted();
    if (current.minimized) {
      const restored = nativeWindowSchema.nullable().parse(await this.invoke([
        "--restore", window.hwnd, String(window.pid), window.creationTime,
      ], signal));
      assertSameWindow(window, restored);
    }
    return waitForCaptureWindow(window, () => this.inspect(window, signal), { signal, requireForeground: current.minimized });
  }
}
