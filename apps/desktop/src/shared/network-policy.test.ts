import { describe, expect, it } from "vitest";
import { API_ORIGIN, DESKTOP_AUTH_URLS, isAllowedRemoteRequest } from "./network-policy";

describe("desktop network policy", () => {
  it("uses the canonical host for every authentication endpoint", () => {
    expect(API_ORIGIN).toBe("https://www.janja.live");
    expect(Object.values(DESKTOP_AUTH_URLS).every((url) => url.startsWith(`${API_ORIGIN}/`))).toBe(true);
  });

  it("allows the canonical API without relying on a blocked redirect", () => {
    expect(isAllowedRemoteRequest(DESKTOP_AUTH_URLS.exchange)).toBe(true);
    expect(isAllowedRemoteRequest("https://janja.live/api/desktop/auth/exchange")).toBe(false);
  });
});
