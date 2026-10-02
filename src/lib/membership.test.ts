import { describe, expect, it } from "vitest";
import { assertCanTargetMember, getMembershipTransition } from "./membership";

describe("membership decisions", () => {
  it("approves a request and activates membership", () => {
    expect(getMembershipTransition("approve")).toEqual({ membership: "active", request: "APPROVED" });
  });

  it("rejects without creating membership", () => {
    expect(getMembershipTransition("reject")).toEqual({ membership: "unchanged", request: "REJECTED" });
  });

  it("revokes access while preserving audit state", () => {
    expect(getMembershipTransition("revoke")).toEqual({ membership: "revoked", request: "unchanged" });
  });

  it("does not let an owner target themselves", () => {
    expect(() => assertCanTargetMember("owner", "owner")).toThrow("OWNER_IMMUTABLE");
  });
});
