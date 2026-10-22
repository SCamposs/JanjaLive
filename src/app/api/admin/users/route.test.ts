import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), listAdminUsers: vi.fn() }));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/account-access", () => ({ listAdminUsers: mocks.listAdminUsers }));
vi.mock("@/lib/api", () => ({
  apiError(error: unknown) {
    const validation = error instanceof Error && error.name === "ZodError";
    return Response.json({ error: validation ? "INVALID_REQUEST" : "REQUEST_FAILED" }, { status: validation ? 400 : 500 });
  },
}));

import { GET } from "./route";

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.listAdminUsers.mockReset();
  });

  it("returns the same empty 404 for unauthenticated and ordinary users", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));

    const response = await GET(new Request("https://www.janja.live/api/admin/users"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it("lists users only after owner verification and disables caching", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "owner" });
    mocks.listAdminUsers.mockResolvedValue({ users: [{ id: "user" }], page: 2, pageSize: 25, total: 40, totalPages: 2, order: "oldest" });

    const response = await GET(new Request("https://www.janja.live/api/admin/users?q=discord-user&order=oldest&page=2"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.listAdminUsers).toHaveBeenCalledWith({ search: "discord-user", order: "oldest", page: 2 });
    expect(await response.json()).toMatchObject({ page: 2, total: 40, order: "oldest" });
  });

  it("falls back to the first and newest page for invalid pagination input", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "owner" });
    mocks.listAdminUsers.mockResolvedValue({ users: [], page: 1, pageSize: 25, total: 0, totalPages: 1, order: "newest" });

    const response = await GET(new Request("https://www.janja.live/api/admin/users?order=random&page=none"));

    expect(response.status).toBe(200);
    expect(mocks.listAdminUsers).toHaveBeenCalledWith({ search: "", order: "newest", page: 1 });
  });
});
