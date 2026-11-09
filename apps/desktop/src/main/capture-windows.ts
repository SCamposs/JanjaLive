import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const handleSchema = z.string().regex(/^[1-9][0-9]{0,19}$/).refine((value) => /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= BigInt("18446744073709551615"));
export const nativeWindowSchema = z.object({
  hwnd: handleSchema,
  pid: z.number().int().positive().max(0xffffffff),
  creationTime: handleSchema,
  title: z.string().min(1).max(512),
  executable: z.string().min(1).max(32768),
  minimized: z.boolean(),
  foreground: z.boolean(),
  clientWidth: z.number().int().min(0).max(65536),
  clientHeight: z.number().int().min(0).max(65536),
}).strict();
export type NativeWindow = z.infer<typeof nativeWindowSchema>;

export function windowSourceId(window: NativeWindow) { return `window:${window.hwnd}:0`; }

export function assertSameWindow(selected: NativeWindow, current: NativeWindow | null): asserts current is NativeWindow {
  if (!current || selected.hwnd !== current.hwnd || selected.pid !== current.pid ||
    selected.creationTime !== current.creationTime || selected.executable.toLowerCase() !== current.executable.toLowerCase()) {
    throw new Error("CAPTURE_WINDOW_CHANGED");
  }
}

export function mergeWindowSources<T extends { id: string }>(sources: T[], windows: NativeWindow[], create: (window: NativeWindow) => T) {
  const handle = (id: string) => /^window:([1-9][0-9]*):[01]$/.exec(id)?.[1];
  const native = new Map(windows.map((window) => [window.hwnd, window]));
  const existing = new Set(sources.flatMap((source) => handle(source.id) ?? []));
  return [
    ...sources.map((source) => ({ source, nativeWindow: native.get(handle(source.id) ?? "") })),
    ...[...native.values()].filter((window) => !existing.has(window.hwnd)).map((window) => ({ source: create(window), nativeWindow: window })),
  ];
}

export async function waitForCaptureWindow(selected: NativeWindow, read: () => Promise<NativeWindow | null>, {
  signal, timeoutMs = 20_000, pollMs = 200, requireForeground = false,
}: { signal?: AbortSignal; timeoutMs?: number; pollMs?: number; requireForeground?: boolean } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    signal?.throwIfAborted();
    const current = await read();
    signal?.throwIfAborted();
    assertSameWindow(selected, current);
    if (!current.minimized && current.clientWidth > 1 && current.clientHeight > 1 && (!requireForeground || current.foreground)) return current;
    if (Date.now() >= deadline) throw new Error("CAPTURE_WINDOW_NOT_READY");
    await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())), undefined, { signal });
  }
}
