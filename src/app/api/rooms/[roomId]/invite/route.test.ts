import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertAuthorizedRoom: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireUser: mocks.requireUser, apiError: () => Response.json({ error: "FORBIDDEN" }, { status: 403 }) }));
vi.mock("@/lib/rooms", () => ({ assertAuthorizedRoom: mocks.assertAuthorizedRoom, regenerateRoomInvite: vi.fn() }));
import { GET } from "./route";
import { verifyShareableInvite } from "@/lib/shareable-invite";
const room = { publicId: "public-id-12345678", inviteHash: "private-stored-hash" };
const context = { params: Promise.resolve({ roomId: "room" }) };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("AUTH_SECRET", "test-only-secret"); mocks.requireUser.mockResolvedValue({ id: "member" }); mocks.assertAuthorizedRoom.mockResolvedValue({ room }); });
afterEach(() => vi.unstubAllEnvs());
it("returns a stable invite to an authorized member without rotating existing invites", async () => {
  const response = await GET(new Request("https://www.janja.live/api/rooms/room/invite"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.assertAuthorizedRoom).toHaveBeenCalledWith("room", "member");
  const { invitePath } = await response.json();
  expect(verifyShareableInvite(invitePath.slice("/room/".length), room)).toBe(true);
});
it("does not disclose an invite to someone without room access", async () => {
  mocks.assertAuthorizedRoom.mockRejectedValue(new Error("ROOM_FORBIDDEN"));
  expect((await GET(new Request("https://www.janja.live/api/rooms/room/invite"), context)).status).toBe(403);
});
