import { describe, expect, it } from "vitest";
import { getSignalCursor, getSignalCutoff, SIGNAL_RETENTION_MS } from "./realtime";

describe("ephemeral signaling retention", () => {
  it("uses a per-event cursor that preserves order inside the same millisecond", () => {
    const now = 1_700_000_000_000;
    expect(getSignalCursor(now, 21)).toBeLessThan(getSignalCursor(now, 22));
  });

  it("cuts signaling payloads off after the configured retention window", () => {
    const now = 1_700_000_000_000;
    expect(getSignalCutoff(now)).toBe((now - SIGNAL_RETENTION_MS) * 1_000);
  });
});
