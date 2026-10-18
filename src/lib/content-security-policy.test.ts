import { describe, expect, it } from "vitest";
import { getRealtimeWebSocketSource } from "./content-security-policy";

describe("getRealtimeWebSocketSource", () => {
  it("converts the configured HTTPS worker to its exact WSS origin", () => {
    expect(getRealtimeWebSocketSource("https://janjalive-realtime.example.workers.dev/socket")).toBe(
      "wss://janjalive-realtime.example.workers.dev",
    );
  });

  it("supports a local HTTP worker without widening the production policy", () => {
    expect(getRealtimeWebSocketSource("http://localhost:8787/socket")).toBe("ws://localhost:8787");
  });

  it.each([undefined, "not a url", "javascript:alert(1)"])("rejects an unsafe value: %s", (value) => {
    expect(getRealtimeWebSocketSource(value)).toBeNull();
  });
});
