import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertAuthorizedRoom: vi.fn(), refreshRoomActivity: vi.fn(), createRealtimeSession: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/api", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : "REQUEST_FAILED" },
    { status: error instanceof Error && error.message === "ACCOUNT_DISABLED" ? 403 : 500 },
  ),
}));
vi.mock("@/lib/rooms", () => ({ assertAuthorizedRoom: mocks.assertAuthorizedRoom, refreshRoomActivity: mocks.refreshRoomActivity }));
vi.mock("@/lib/realtime", () => ({ createRealtimeSession: mocks.createRealtimeSession, enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/discord/guilds", () => ({ assertGuildAdmission: vi.fn() }));

import { GET } from "./route";

describe("GET /api/realtime/session", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it.each([false, true])("issues idle policy only for Discord rooms (call=%s)", async call => {
    mocks.requireUser.mockResolvedValue({ id: "user" });
    mocks.assertAuthorizedRoom.mockResolvedValue({ room: { discordGuildId: call ? "guild" : null } });
    mocks.createRealtimeSession.mockResolvedValue({ provider: "cloudflare" });
    expect((await GET(new Request("https://www.janja.live/api/realtime/session?roomId=room"))).status).toBe(200);
    expect(mocks.createRealtimeSession).toHaveBeenCalledWith(...(call ? ["room", "user", undefined, true, "guild"] : ["room", "user"]));
  });

  it("does not issue a new realtime credential to a banned account", async () => {
    mocks.requireUser.mockRejectedValue(new Error("ACCOUNT_DISABLED"));
    const response = await GET(new Request("https://www.janja.live/api/realtime/session?roomId=11111111-1111-4111-8111-111111111111"));

    expect(response.status).toBe(403);
    expect(mocks.assertAuthorizedRoom).not.toHaveBeenCalled();
    expect(mocks.createRealtimeSession).not.toHaveBeenCalled();
  });
});
