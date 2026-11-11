import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import HomePage from "./page";
import JoinRoomPage from "./join/[publicId]/page";
import RoomPage from "./room/[token]/page";
import { getLoginDestination } from "@/lib/login-destination";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), signIn: vi.fn(), requireUser: vi.fn(), activeUser: vi.fn(),
  snapshot: vi.fn(), publicSnapshot: vi.fn(), list: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn }));
vi.mock("@/lib/api", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/account-access", () => ({ getActiveUserById: mocks.activeUser }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/rooms", () => ({ getRoomSnapshot: mocks.snapshot, getRoomSnapshotByPublicId: mocks.publicSnapshot, listAvailableRooms: mocks.list }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/room-experience", () => ({ RoomExperience: () => null }));
vi.mock("@/components/access-gate", () => ({ AccessGate: () => null }));
vi.mock("@/components/create-room-form", () => ({ CreateRoomForm: () => null }));
vi.mock("@/components/room-list", () => ({ RoomList: () => null }));
vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));

function findForm(node: ReactNode): { action: () => Promise<void> } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; action: () => Promise<void> }>(child)) continue;
    if (child.type === "form") return child.props;
    const form = findForm(child.props.children);
    if (form) return form;
  }
}
const home = (returnTo?: string | string[]) => HomePage({ searchParams: Promise.resolve({ returnTo }) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(null); mocks.requireUser.mockRejectedValue(new Error("UNAUTHORIZED")); });

it.each(["/join/abc-123_", "/room/secret-token"])("resumes %s after Discord login", async (destination) => {
  const page = await home(destination);
  await findForm(page)!.action();
  expect(mocks.signIn).toHaveBeenCalledWith("discord", { redirectTo: destination });
});

it("preserves public and legacy invitations before asking for login without looking up private room data", async () => {
  await expect(JoinRoomPage({ params: Promise.resolve({ publicId: "abc-123" }) })).rejects.toThrow("REDIRECT:/?returnTo=%2Fjoin%2Fabc-123");
  await expect(RoomPage({ params: Promise.resolve({ token: "secret" }) })).rejects.toThrow("REDIRECT:/?returnTo=%2Froom%2Fsecret");
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(mocks.publicSnapshot).not.toHaveBeenCalled();
});

it("continues a saved invitation immediately for an already authenticated active user", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "user" } });
  mocks.activeUser.mockResolvedValue({ id: "user", name: "User" });
  await expect(home("/join/abc")).rejects.toThrow("REDIRECT:/join/abc");
  expect(mocks.list).not.toHaveBeenCalled();
});

it.each([undefined, ["/join/abc"], "https://evil.example", "//evil.example", "/join/abc/../../admin", "/join/abc?next=evil", "/room/a%2fb", "/join/a\\evil", "/admin", "/join/a\n"])("ignores unsafe or unrelated login destinations: %s", (value) => {
  expect(getLoginDestination(value)).toBeNull();
});

it("keeps ordinary login directed to home", async () => {
  await findForm(await home())!.action();
  expect(mocks.signIn).toHaveBeenCalledWith("discord", { redirectTo: "/" });
});

it("does not resume an invitation for a disabled account", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "user" } });
  mocks.activeUser.mockResolvedValue(null);
  const page = await home("/join/abc");
  expect(findForm(page)).toBeUndefined();
  expect(mocks.list).not.toHaveBeenCalled();
});
