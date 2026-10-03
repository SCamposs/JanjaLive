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
});
