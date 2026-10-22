import { describe, expect, it } from "vitest";
import { assertAdminTarget, getConfiguredOwner, isOwnerIdentity } from "./admin-policy";

const environment = { ADMIN_USER_ID: "internal-owner", ADMIN_DISCORD_USER_ID: "discord-owner" };

describe("single-owner admin policy", () => {
  it("requires both server-side owner identifiers", () => {
    expect(getConfiguredOwner(environment)).toEqual({ userId: "internal-owner", discordId: "discord-owner" });
    expect(() => getConfiguredOwner({ ADMIN_USER_ID: "internal-owner" })).toThrow("ADMIN_NOT_CONFIGURED");
  });

  it("rejects identities when either stable identifier differs", () => {
    expect(isOwnerIdentity({ userId: "internal-owner", discordId: "discord-owner" }, environment)).toBe(true);
    expect(isOwnerIdentity({ userId: "other", discordId: "discord-owner" }, environment)).toBe(false);
    expect(isOwnerIdentity({ userId: "internal-owner", discordId: "other" }, environment)).toBe(false);
  });

  it("rejects non-owner actors and owner self-ban targets", () => {
    expect(() => assertAdminTarget("other", "target", "internal-owner")).toThrow("NOT_FOUND");
    expect(() => assertAdminTarget("internal-owner", "internal-owner", "internal-owner")).toThrow("ADMIN_SELF_BAN");
    expect(() => assertAdminTarget("internal-owner", "target", "internal-owner")).not.toThrow();
  });
});
