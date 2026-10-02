import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES, clampCustomBitrate, estimateOutboundMbps, getCaptureConstraints } from "./quality";

describe("quality profiles", () => {
  it("maps 1080p60 to the expected target", () => {
    expect(QUALITY_PROFILES["1080p60"]).toMatchObject({ width: 1920, height: 1080, frameRate: 60, bitrate: 10_000_000 });
  });

  it("clamps custom bitrate between 2 and 25 Mbps", () => {
    expect(clampCustomBitrate(1)).toBe(2_000_000);
    expect(clampCustomBitrate(30)).toBe(25_000_000);
  });

  it("estimates outbound target per active viewer", () => {
    expect(estimateOutboundMbps(10_000_000, 3)).toBe(30);
  });

  it("does not upscale source mode", () => {
    expect(getCaptureConstraints("source")).toEqual({});
  });
});
