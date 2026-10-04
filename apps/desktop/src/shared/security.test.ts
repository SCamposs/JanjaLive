import { describe, expect, it } from "vitest";
import { clientSignalSchema, roomCreateInputSchema, roomSnapshotSchema } from "./contracts";
import { ExpiringGrantStore } from "./expiring-grants";
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
    expect(parseExternalUrl("https://www.janja.live/privacidade")).toBe("https://www.janja.live/privacidade");
    expect(parseExternalUrl("https://evil.test")).toBeNull();
    expect(parseExternalUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("desktop IPC contracts", () => {
  it("rejects extra room creation fields", () => {
    expect(roomCreateInputSchema.safeParse({ name: "Amigos", accessMode: "APPROVAL", ownerId: "attacker" }).success).toBe(false);
  });

  it("rejects signaling fields outside the protocol", () => {
    expect(clientSignalSchema.safeParse({ type: "presence:join", command: "open-shell" }).success).toBe(false);
  });

  it("rejects oversized or malformed room responses", () => {
    expect(roomSnapshotSchema.safeParse({ room: {}, access: "authorized", members: [], pending: [] }).success).toBe(false);
  });
});

describe("desktop capture grants", () => {
  it("binds a source to one renderer and consumes it once", () => {
    const grants = new ExpiringGrantStore<string>();
    grants.set("source", { value: "screen:1", ownerId: 7, expiresAt: 2_000 });
    expect(grants.take("source", 8, 1_000)).toBeNull();
    expect(grants.take("source", 7, 1_000)).toBeNull();

    grants.set("fresh", { value: "screen:1", ownerId: 7, expiresAt: 2_000 });
    expect(grants.take("fresh", 7, 1_000)).toBe("screen:1");
    expect(grants.take("fresh", 7, 1_000)).toBeNull();
  });

  it("rejects expired sources and clears stale grants", () => {
    const grants = new ExpiringGrantStore<string>();
    grants.set("expired", { value: "screen:1", ownerId: 7, expiresAt: 999 });
    expect(grants.take("expired", 7, 1_000)).toBeNull();
    grants.set("owned", { value: "screen:2", ownerId: 7, expiresAt: 2_000 });
    grants.clearOwner(7, 1_000);
    expect(grants.take("owned", 7, 1_000)).toBeNull();
  });
});
