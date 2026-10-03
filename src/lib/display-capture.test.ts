import { describe, expect, it } from "vitest";
import { getWebDisplayCaptureOptions } from "./display-capture";

describe("getWebDisplayCaptureOptions", () => {
  it("requests optional shared audio without restricting the selected surface", () => {
    expect(getWebDisplayCaptureOptions()).toEqual({
      video: true,
      audio: true,
      systemAudio: "include",
    });
  });

  it("can explicitly request a video-only fallback", () => {
    expect(getWebDisplayCaptureOptions(false)).toEqual({
      video: true,
      audio: false,
      systemAudio: "exclude",
    });
  });
});
