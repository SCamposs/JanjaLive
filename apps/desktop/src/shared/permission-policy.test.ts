import { describe, expect, it } from "vitest";
import { canGrantDesktopPermission } from "./permission-policy";

const trustedDisplayCapture = {
  permission: "display-capture",
  isMainFrame: true,
  isMainWindow: true,
  isTrustedRenderer: true,
};

describe("desktop permission policy", () => {
  it("allows display capture from the trusted main renderer", () => {
    expect(canGrantDesktopPermission(trustedDisplayCapture)).toBe(true);
  });

  it.each([
    ["camera and microphone", { permission: "media" }],
    ["subframes", { isMainFrame: false }],
    ["other windows", { isMainWindow: false }],
    ["untrusted renderer URLs", { isTrustedRenderer: false }],
  ])("denies %s", (_label, override) => {
    expect(canGrantDesktopPermission({ ...trustedDisplayCapture, ...override })).toBe(false);
  });
});
