// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  manageMember: vi.fn(),
  core: { roomUnavailable: false, onlineUserIds: ["owner", "Alice", "Bob"], membershipRevision: 0, activeStreams: ["Alice", "Bob"].map((streamerUserId) => ({ streamerUserId, preset: "1080p60", hasAudio: true })), remoteStreams: { Alice: {}, Bob: {} }, viewerUserIds: [], connectionStatus: "good", connectionError: null, watch: vi.fn().mockResolvedValue(undefined), stopWatching: vi.fn().mockResolvedValue(undefined), startBroadcast: vi.fn(), replaceBroadcast: vi.fn(), stopBroadcast: vi.fn() },
}));
vi.mock("./use-room-media", () => ({ useRoomMedia: () => mocks.core }));
vi.mock("./DesktopNoirBackdrop", () => ({ DesktopNoirBackdrop: () => null }));
vi.mock("@janjalive/webrtc", () => ({ playRoomCue: async () => {} }));

const room = {
  room: { id: "room", name: "Multilive QA", publicId: "room-public", code: "ABCD234", isOwner: true },
  access: "authorized", pending: [] as { userId: string; name: string; image: null }[],
  members: ["owner", "Alice", "Bob"].map((userId) => ({ userId, name: userId, image: null, role: userId === "owner" ? "OWNER" : "MEMBER" })),
};
beforeEach(() => {
  room.pending = [];
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, "janja", { configurable: true, value: {
    app: { getVersion: async () => "test", onRoomInvite: () => () => {} },
    auth: { getStatus: async () => ({ state: "signed-in", user: { id: "owner", name: "owner", image: null } }), onStatus: () => () => {} },
    updater: { getStatus: async () => ({ state: "idle" }), onStatus: () => () => {} },
    rooms: { manageMember: mocks.manageMember, list: async () => [{ id: "room", name: "Multilive QA", role: "OWNER", expiresInMs: 86400000 }], get: async () => room },
  } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("plays both desktop lives and controls each volume and mute independently", async () => {
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /^Multilive QA/ }));
  fireEvent.click((await screen.findAllByRole("button", { name: "Assistir Alice" }))[0]!);
  fireEvent.click((await screen.findAllByRole("button", { name: "Assistir Bob" }))[0]!);
  const videos = view.container.querySelectorAll<HTMLVideoElement>(".desktop-player video");
  expect(videos).toHaveLength(2);
  expect(videos[0]!.muted).toBe(false);
  expect(videos[1]!.muted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ativar som" }));
  expect(videos[0]!.muted).toBe(false);
  expect(videos[1]!.muted).toBe(false);
  const first = within(view.container.querySelectorAll(".desktop-player")[0] as HTMLElement);
  fireEvent.change(first.getByLabelText("Volume"), { target: { value: "0.25" } });
  expect(videos[0]!.volume).toBe(0.25);
  expect(videos[1]!.volume).toBe(1);
  fireEvent.click(first.getByRole("button", { name: "Silenciar" }));
  expect(videos[0]!.muted).toBe(true);
  expect(videos[1]!.muted).toBe(false);
  fireEvent.change(first.getByLabelText("Volume"), { target: { value: "0.5" } });
  expect(videos[0]!.muted).toBe(true);
  await waitFor(() => expect(mocks.core.watch).toHaveBeenCalledTimes(2));
});

it("shows approval progress without resizing desktop controls and blocks duplicate requests", async () => {
  room.pending = [{ userId: "friend", name: "Friend", image: null }];
  let finish!: (value: typeof room) => void;
  mocks.manageMember.mockImplementationOnce(() => new Promise<typeof room>((resolve) => { finish = resolve; }));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /^Multilive QA/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Aprovar Friend" }));
  const busy = screen.getByRole("button", { name: "Aprovando Friend" });
  expect(busy.getAttribute("aria-busy")).toBe("true");
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Recusar Friend" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(busy);
  expect(mocks.manageMember).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ...room, pending: [] }));
  expect(screen.queryByRole("button", { name: "Aprovando Friend" })).toBeNull();
});
