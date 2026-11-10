// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@/lib/rooms";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
  media: { membershipRevision: 0, onlineUserIds: [], activeStreams: [], remoteStreams: {}, remoteConnectionStatuses: {}, viewerUserIds: [], connectionStatus: "good", connectionError: null, stopWatching: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/hooks/use-room-media", () => ({ useRoomMedia: () => mocks.media }));
vi.mock("./noir-interference", () => ({ NoirInterference: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./account-menu", () => ({ AccountMenu: () => null }));
vi.mock("./screen-share-dialog", () => ({ ScreenShareDialog: () => null }));
import { RoomExperience } from "./room-experience";

const snapshot: RoomSnapshot = { room: { id: "room", publicId: "public", name: "Amigos", code: "ABCD234", accessMode: "APPROVAL", isOwner: true }, access: "authorized", members: [], pending: [] };
const request = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", request); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function confirmClose() {
  render(<RoomExperience snapshot={snapshot} currentUser={{ id: "owner" }} />);
  fireEvent.click(screen.getByText("Fechar sala"));
  const dialog = await screen.findByRole("alertdialog");
  expect(request).not.toHaveBeenCalled();
  return dialog;
}

it("requires confirmation and keeps a failed close available for retry", async () => {
  request.mockResolvedValue(new Response(null, { status: 503 }));
  const dialog = await confirmClose();
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir sala" }));
  expect((await within(dialog).findByRole("alert")).textContent).toContain("Não foi possível excluir");
  expect(mocks.router.push).not.toHaveBeenCalled();
});

it("leaves the room only after the server confirms closing it", async () => {
  request.mockResolvedValue(new Response(null, { status: 204 }));
  const dialog = await confirmClose();
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir sala" }));
  await vi.waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith("/"));
  expect(request).toHaveBeenCalledWith("/api/rooms/room/close", { method: "POST" });
});
