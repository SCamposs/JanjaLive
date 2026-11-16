import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "./web-analytics";

describe("sanitizeAnalyticsEvent", () => {
  it("redacts invite and room identifiers before analytics", () => {
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://janja.live/room/sensitive-token?source=invite" }).url)
      .toBe("https://janja.live/room/[invite]");
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://janja.live/join/public-id" }).url)
      .toBe("https://janja.live/join/[room]");
  });

  it("removes query strings and fragments from every event", () => {
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://janja.live/termos?private=value#section" }).url)
      .toBe("https://janja.live/termos");
  });

  it("redacts Discord intent and session entry identifiers", () => {
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://janja.live/discord/private-intent" }).url).toBe("https://janja.live/discord/[intent]");
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://janja.live/call/private-room" }).url).toBe("https://janja.live/call/[room]");
  });
});
