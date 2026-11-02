import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), revokeAllUserSessions: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api")>(), requireUser: mocks.requireUser }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/user-sessions", () => ({ revokeAllUserSessions: mocks.revokeAllUserSessions }));
import { DELETE } from "./route";

function request(origin = "https://www.janja.live") {
  return new Request("https://www.janja.live/api/account/sessions", { method: "DELETE", headers: { Origin: origin } });
}

describe("sign out everywhere", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("rejects cross-origin logout before looking up an account", async () => {
    expect((await DELETE(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
  });
  it("derives the revocation target from the authenticated identity", async () => {
    mocks.requireUser.mockResolvedValue({ id: "current-user" });
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith("current-user");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("surfaces a partial failure rather than claiming every connection was closed", async () => {
    mocks.requireUser.mockResolvedValue({ id: "current-user" });
    mocks.revokeAllUserSessions.mockRejectedValue(new Error("ACCESS_REVOCATION_INCOMPLETE"));
    expect((await DELETE(request())).status).toBe(503);
  });
});
