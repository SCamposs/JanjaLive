import { describe, expect, it } from "vitest";
import { canGrantDesktopPermission } from "./permission-policy";

const trustedDisplayCapture = {
  hasCaptureGrant: true,
  isLegacyDisplayCapture: false,
  permission: "display-capture",
  isMainFrame: true,
  isMainWindow: true,
  isTrustedRenderer: true,
};

describe("desktop permission policy", () => {
  it("allows display capture from the trusted main renderer", () => {
    expect(canGrantDesktopPermission(trustedDisplayCapture)).toBe(true);
  });

  it("allows Electron 44's legacy display capture without granting device media", () => {
    expect(canGrantDesktopPermission({
      ...trustedDisplayCapture,
      permission: "media",
      isLegacyDisplayCapture: true,
    })).toBe(true);
    expect(canGrantDesktopPermission({
      ...trustedDisplayCapture,
      permission: "media",
      isLegacyDisplayCapture: false,
    })).toBe(false);
  });

  it.each([
    ["unrelated permissions", { permission: "geolocation" }],
    ["capture requests without a grant", { hasCaptureGrant: false }],
    ["subframes", { isMainFrame: false }],
    ["other windows", { isMainWindow: false }],
    ["untrusted renderer URLs", { isTrustedRenderer: false }],
  ])("denies %s", (_label, override) => {
    expect(canGrantDesktopPermission({ ...trustedDisplayCapture, ...override })).toBe(false);
  });
});
