import { describe, expect, it } from "vitest";
import { isDesktopVersionSupported } from "./desktop-version";

describe("desktop minimum version", () => {
  it("does nothing until a minimum version is configured", () => {
    expect(isDesktopVersionSupported(null, undefined)).toBe(true);
  });

  it("accepts equal or newer stable versions", () => {
    expect(isDesktopVersionSupported("0.1.0", "0.1.0")).toBe(true);
    expect(isDesktopVersionSupported("0.2.0", "0.1.9")).toBe(true);
  });

  it("rejects older, missing, or malformed versions once enabled", () => {
    expect(isDesktopVersionSupported("0.1.0", "0.1.1")).toBe(false);
    expect(isDesktopVersionSupported(null, "0.1.0")).toBe(false);
    expect(isDesktopVersionSupported("dev", "0.1.0")).toBe(false);
  });
});
