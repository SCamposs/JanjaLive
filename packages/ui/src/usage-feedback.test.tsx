// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlayerAudio } from "./player-audio";
import { useCapturePreferences } from "./capture-preferences";
import { useVisiblePolling } from "./visible-polling";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("keeps live audio independent and remembers the default volume for new players", () => {
  const hook = renderHook(() => ({ a: usePlayerAudio(false), b: usePlayerAudio(true) }));
  expect(hook.result.current.b.muted).toBe(true);
  act(() => hook.result.current.b.setMuted(false));
  expect(hook.result.current.a.muted).toBe(false);
  expect(hook.result.current.b.muted).toBe(false);
  act(() => hook.result.current.a.setVolume(0.35));
  expect(hook.result.current.b.volume).toBe(1);
  act(() => hook.result.current.a.setMuted(true));
  expect(hook.result.current.b.muted).toBe(false);
  hook.unmount();
  const next = renderHook(() => usePlayerAudio(true));
  expect(next.result.current.volume).toBe(0.35);
  expect(next.result.current.muted).toBe(true);
});

it("preserves explicit mute when adjusting volume", () => {
  const hook = renderHook(() => usePlayerAudio(true));
  act(() => hook.result.current.setVolume(0.5));
  expect(hook.result.current.volume).toBe(0.5);
  expect(hook.result.current.muted).toBe(true);
});

it("recovers from corrupt capture preferences and remembers valid choices", () => {
  localStorage.setItem("janjalive:capture-preferences", '{"resolution":"bad","fps":999,"customBitrate":100}');
  const hook = renderHook(useCapturePreferences);
  expect(hook.result.current.resolution).toBe("1080p");
  expect(hook.result.current.fps).toBe(60);
  expect(hook.result.current.customBitrate).toBe(25);
  act(() => hook.result.current.setFps(30));
  hook.unmount();
  expect(renderHook(useCapturePreferences).result.current.fps).toBe(30);
});

it("pauses approval checks while hidden and checks immediately on return", async () => {
  vi.useFakeTimers();
  let visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
  const check = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useVisiblePolling(check, true));
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  expect(check).toHaveBeenCalledTimes(1);
  visibility = "hidden";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(check).toHaveBeenCalledTimes(1);
  visibility = "visible";
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(check).toHaveBeenCalledTimes(2);
  hook.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(check).toHaveBeenCalledTimes(2);
});

it("does not overlap slow checks and aborts their results on unmount", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  const check = vi.fn((value: AbortSignal) => { signal = value; return new Promise<void>((resolve) => { finish = resolve; }); });
  const hook = renderHook(() => useVisiblePolling(check, true));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(check).toHaveBeenCalledOnce();
  hook.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => finish());
});
