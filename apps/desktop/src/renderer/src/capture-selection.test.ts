import { describe, expect, it, vi } from "vitest";
import { acquireCapture } from "./capture-selection";

describe("capture preparation cancellation", () => {
  it("does not open display capture after a cancelled native preparation", async () => {
    const controller = new AbortController();
    const getMedia = vi.fn();
    await expect(acquireCapture(async () => { controller.abort(); }, getMedia, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(getMedia).not.toHaveBeenCalled();
  });
  it("stops all tracks when display capture resolves after cancellation", async () => {
    const controller = new AbortController();
    const stopVideo = vi.fn(); const stopAudio = vi.fn();
    const stream = { getTracks: () => [{ stop: stopVideo }, { stop: stopAudio }] } as unknown as MediaStream;
    await expect(acquireCapture(async () => {}, async () => { controller.abort(); return stream; }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(stopVideo).toHaveBeenCalledOnce(); expect(stopAudio).toHaveBeenCalledOnce();
  });
  it("returns the original stream without transforming its tracks", async () => {
    const stream = { getTracks: vi.fn() } as unknown as MediaStream;
    expect(await acquireCapture(async () => {}, async () => stream, new AbortController().signal)).toBe(stream);
    expect(stream.getTracks).not.toHaveBeenCalled();
  });
});
