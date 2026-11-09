import { describe, expect, it, vi } from "vitest";
import { restoreSavedSession } from "./session-restore";

describe("saved desktop session", () => {
  it.each(["offline", "503", "429", "426", "invalid service response"])("preserves credentials on %s", async (reason) => {
    const clear = vi.fn();
    await expect(restoreSavedSession({ read: async () => ({ token: "saved" }), validate: async () => { throw new Error(reason); }, clear })).rejects.toThrow(reason);
    expect(clear).not.toHaveBeenCalled();
  });
  it("clears an authoritatively invalid session", async () => {
    const clear = vi.fn();
    expect(await restoreSavedSession({ read: async () => ({ token: "expired" }), validate: async () => null, clear })).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });
  it("restores a valid session without OAuth or deletion", async () => {
    const clear = vi.fn();
    const status = { state: "signed-in" as const, user: { id: "user", name: "User", image: null } };
    expect(await restoreSavedSession({ read: async () => ({ token: "valid" }), validate: async () => status, clear })).toEqual({ token: "valid", status });
    expect(clear).not.toHaveBeenCalled();
  });
});
