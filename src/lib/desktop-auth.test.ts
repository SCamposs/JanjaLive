import { describe, expect, it } from "vitest";
import { desktopSecretsMatch, getPkceChallenge, hashDesktopSecret } from "./desktop-auth";

describe("desktop auth primitives", () => {
  it("derives a deterministic base64url PKCE challenge", () => {
    const verifier = "a".repeat(43);
    expect(getPkceChallenge(verifier)).toBe(hashDesktopSecret(verifier));
    expect(getPkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("compares secrets without accepting different values or lengths", () => {
    expect(desktopSecretsMatch("same", "same")).toBe(true);
    expect(desktopSecretsMatch("same", "diff")).toBe(false);
    expect(desktopSecretsMatch("same", "shorter")).toBe(false);
  });

  it("rejects malformed PKCE verifiers", () => {
    expect(() => getPkceChallenge("too-short")).toThrow("INVALID_DESKTOP_AUTH");
    expect(() => getPkceChallenge("x".repeat(43) + "+")).toThrow("INVALID_DESKTOP_AUTH");
  });
});
