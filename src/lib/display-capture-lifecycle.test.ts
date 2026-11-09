import { afterEach, expect, it, vi } from "vitest";
import { prepareDisplayCapture } from "./display-capture";
afterEach(() => vi.unstubAllGlobals());
function fixture(prepare = Promise.resolve()) {
  const stop = vi.fn();
  const video = { stop, applyConstraints: () => prepare };
  const stream = { getTracks: () => [video], getVideoTracks: () => [video], getAudioTracks: () => [] } as unknown as MediaStream;
  return { stream, stop };
}
it("stops a late browser selection when its dialog was already cancelled", async () => {
  const f = fixture();
  let resolve!: (value: MediaStream) => void;
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: () => new Promise<MediaStream>((r) => { resolve = r; }) } });
  const request = new AbortController();
  const result = prepareDisplayCapture({ video: true }, {}, request.signal);
  request.abort();
  resolve(f.stream);
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(f.stop).toHaveBeenCalled();
});
it("immediately stops tracks if cancellation occurs during constraint application", async () => {
  let resolve!: () => void;
  const f = fixture(new Promise<void>((r) => { resolve = r; }));
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => f.stream } });
  const request = new AbortController();
  const result = prepareDisplayCapture({ video: true }, {}, request.signal);
  await Promise.resolve();
  request.abort();
  expect(f.stop).toHaveBeenCalled();
  resolve();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
it("keeps a successful capture live for publication", async () => {
  const f = fixture();
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => f.stream } });
  expect(await prepareDisplayCapture({ video: true }, {}, new AbortController().signal)).toBe(f.stream);
  expect(f.stop).not.toHaveBeenCalled();
});
