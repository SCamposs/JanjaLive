import { describe, expect, it } from "vitest";
import { canGrantDesktopPermission } from "./permission-policy";

const trustedDisplayCapture = {
  hasCaptureGrant: true,
  permission: "display-capture",
  isMainFrame: true,
  isMainWindow: true,
  isTrustedRenderer: true,
};

describe("desktop permission policy", () => {
  it("allows display capture from the trusted main renderer", () => {
    expect(canGrantDesktopPermission(trustedDisplayCapture)).toBe(true);
  });

  it("allows Electron's media permission only while a capture grant is active", () => {
    expect(canGrantDesktopPermission({ ...trustedDisplayCapture, permission: "media" })).toBe(true);
    expect(canGrantDesktopPermission({ ...trustedDisplayCapture, permission: "media", hasCaptureGrant: false })).toBe(false);
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
