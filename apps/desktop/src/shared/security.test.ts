import { describe, expect, it } from "vitest";
import { findDeepLink, parseDeepLink, parseExternalUrl } from "./security";

const code = "c".repeat(43);
const state = "s".repeat(43);

describe("desktop URL boundary", () => {
  it("accepts only the two declared deep-link shapes", () => {
    expect(parseDeepLink(`janjalive://auth/callback?code=${code}&state=${state}`)).toEqual({ type: "auth", code, state });
    expect(parseDeepLink("janjalive://room/opaque-room-token")).toEqual({ type: "room", roomToken: "opaque-room-token" });
    expect(parseDeepLink("janjalive://settings/reset")).toBeNull();
  });

  it("rejects extra fields, unsafe schemes, short tokens and oversized input", () => {
    expect(parseDeepLink(`janjalive://auth/callback?code=${code}&state=${state}&next=https://evil.test`)).toBeNull();
    expect(parseDeepLink("javascript:alert(1)")).toBeNull();
    expect(parseDeepLink("janjalive://room/short")).toBeNull();
    expect(parseDeepLink(`janjalive://room/${"a".repeat(1_100)}`)).toBeNull();
  });

  it("extracts a valid deep link from Windows argv", () => {
    expect(findDeepLink(["JanjaLive.exe", "--flag", "janjalive://room/opaque-room-token"])).toEqual({ type: "room", roomToken: "opaque-room-token" });
  });

  it("allows only fixed external destinations", () => {
    expect(parseExternalUrl("https://janja.live/privacidade")).toBe("https://janja.live/privacidade");
    expect(parseExternalUrl("https://evil.test")).toBeNull();
    expect(parseExternalUrl("file:///etc/passwd")).toBeNull();
  });
});
