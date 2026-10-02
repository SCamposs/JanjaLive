import { describe, expect, it } from "vitest";
import {
  getRealtimeCredentials,
  getSignalCursor,
  getSignalCutoff,
  SIGNAL_RETENTION_MS,
} from "./realtime";

describe("realtime credentials", () => {
  it("accepts the variable names provisioned by the Vercel Upstash integration", () => {
    expect(getRealtimeCredentials({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "token",
    })).toEqual({ url: "https://example.upstash.io", token: "token" });
  });

  it("prefers the native Upstash variable names when both are present", () => {
    expect(getRealtimeCredentials({
      UPSTASH_REDIS_REST_URL: "https://native.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "native-token",
      KV_REST_API_URL: "https://vercel.upstash.io",
      KV_REST_API_TOKEN: "vercel-token",
    })).toEqual({ url: "https://native.upstash.io", token: "native-token" });
  });
});

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
