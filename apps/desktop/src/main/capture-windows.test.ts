import { describe, expect, it } from "vitest";
import { assertSameWindow, mergeWindowSources, nativeWindowSchema, waitForCaptureWindow, type NativeWindow } from "./capture-windows";
const window: NativeWindow = { hwnd: "1234", pid: 42, creationTime: "134000000000000000", executable: "C:\\Games\\game.exe", title: "Game", minimized: true, foreground: false, clientWidth: 0, clientHeight: 0 };
const ready = { ...window, minimized: false, foreground: true, clientWidth: 1920, clientHeight: 1080 };

describe("native capture window boundary", () => {
  it("preserves every screen and existing source while adding missing application windows once", () => {
    const sources = [{ id: "screen:0:0", name: "Tela 1" }, { id: "screen:1:0", name: "Tela 2" }, { id: "window:1234:1", name: "Game" }];
    const missing = { ...window, hwnd: "5678", title: "Missing game" };
    const merged = mergeWindowSources(sources, [window, missing, missing], (w) => ({ id: `window:${w.hwnd}:0`, name: w.title }));
    expect(merged.map((item) => item.source)).toEqual([...sources, { id: "window:5678:0", name: "Missing game" }]);
    expect(merged[2]?.nativeWindow).toEqual(window);
  });
  it("uses only valid HWND identities and rejects monitor identifiers and overflowing PIDs", () => {
    expect(nativeWindowSchema.safeParse(window).success).toBe(true);
    for (const value of [{ ...window, hwnd: "screen:0:0" }, { ...window, hwnd: "18446744073709551616" }, { ...window, pid: 0x100000000 }]) {
      expect(nativeWindowSchema.safeParse(value).success).toBe(false);
    }
  });
  it("rejects HWND reuse, PID reuse and changed executables", () => {
    for (const changed of [null, { ...ready, pid: 43 }, { ...ready, creationTime: "134000000000000001" }, { ...ready, executable: "C:\\other.exe" }]) {
      expect(() => assertSameWindow(window, changed)).toThrow("CAPTURE_WINDOW_CHANGED");
    }
  });
  it("waits for the same window to be restored and become renderable", async () => {
    let reads = 0;
    const result = await waitForCaptureWindow(window, async () => ++reads < 3 ? window : ready, { pollMs: 1 });
    expect(result).toEqual(ready);
    expect(reads).toBe(3);
  });
  it("does not require foreground for ordinary unminimized application capture", async () => {
    expect(await waitForCaptureWindow(window, async () => ({ ...ready, foreground: false }))).toEqual({ ...ready, foreground: false });
  });
  it("requires foreground when explicitly restoring a minimized source", async () => {
    await expect(waitForCaptureWindow(window, async () => ({ ...ready, foreground: false }), { requireForeground: true, timeoutMs: 0 })).rejects.toThrow("CAPTURE_WINDOW_NOT_READY");
  });
  it("cancellation wins over a late successful inspection", async () => {
    const controller = new AbortController();
    await expect(waitForCaptureWindow(window, async () => { controller.abort(); return ready; }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("fails when the selected application closes instead of choosing another source", async () => {
    await expect(waitForCaptureWindow(window, async () => null)).rejects.toThrow("CAPTURE_WINDOW_CHANGED");
  });
  it("times out a minimized source without granting a capture", async () => {
    await expect(waitForCaptureWindow(window, async () => window, { timeoutMs: 0 })).rejects.toThrow("CAPTURE_WINDOW_NOT_READY");
  });
});
