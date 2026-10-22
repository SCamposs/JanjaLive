import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getDesktopUserFromToken: vi.fn(),
  getActiveUserById: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/desktop-auth", () => ({ getDesktopUserFromToken: mocks.getDesktopUserFromToken }));
vi.mock("@/lib/account-access", () => ({ getActiveUserById: mocks.getActiveUserById }));

import { apiError, requireUser } from "./api";

describe("central account access enforcement", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getDesktopUserFromToken.mockReset();
    mocks.getActiveUserById.mockReset();
    delete process.env.MINIMUM_DESKTOP_VERSION;
  });

  it("revalidates a web session against the current account state", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "banned-user" } });
    mocks.getActiveUserById.mockRejectedValue(new Error("ACCOUNT_DISABLED"));

    await expect(requireUser()).rejects.toThrow("ACCOUNT_DISABLED");
    expect(mocks.getActiveUserById).toHaveBeenCalledWith("banned-user");
  });

  it("revalidates an existing desktop bearer session against the current account state", async () => {
    mocks.getDesktopUserFromToken.mockResolvedValue({ id: "banned-user" });
    mocks.getActiveUserById.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
    const request = new Request("https://www.janja.live/api/realtime/session", {
      headers: { Authorization: `Bearer ${"a".repeat(43)}` },
    });

    await expect(requireUser(request)).rejects.toThrow("ACCOUNT_DISABLED");
    expect(mocks.getActiveUserById).toHaveBeenCalledWith("banned-user");
  });

  it("returns a stable forbidden response without leaking account details", async () => {
    const response = apiError(new Error("ACCOUNT_DISABLED"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "ACCOUNT_DISABLED" });
  });
});
