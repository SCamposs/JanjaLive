import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertAuthorizedRoom: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/api", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : "REQUEST_FAILED" },
    { status: error instanceof Error && error.message === "ACCOUNT_DISABLED" ? 403 : 500 },
  ),
}));
vi.mock("@/lib/rooms", () => ({ assertAuthorizedRoom: mocks.assertAuthorizedRoom }));
vi.mock("@/lib/realtime", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { GET } from "./route";

describe("GET /api/ice-servers", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it("does not issue TURN credentials to a banned account", async () => {
    mocks.requireUser.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
    const response = await GET(new Request("https://www.janja.live/api/ice-servers?roomId=11111111-1111-4111-8111-111111111111"));

    expect(response.status).toBe(403);
    expect(mocks.assertAuthorizedRoom).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});
