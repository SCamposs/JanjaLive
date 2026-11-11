// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  core: { roomUnavailable: false, onlineUserIds: ["owner", "Alice", "Bob"], membershipRevision: 0, activeStreams: ["Alice", "Bob"].map((streamerUserId) => ({ streamerUserId, preset: "1080p60", hasAudio: true })), remoteStreams: { Alice: {}, Bob: {} }, viewerUserIds: [], connectionStatus: "good", connectionError: null, watch: vi.fn().mockResolvedValue(undefined), stopWatching: vi.fn().mockResolvedValue(undefined), startBroadcast: vi.fn(), replaceBroadcast: vi.fn(), stopBroadcast: vi.fn() },
}));
vi.mock("./use-room-media", () => ({ useRoomMedia: () => mocks.core }));
vi.mock("./DesktopNoirBackdrop", () => ({ DesktopNoirBackdrop: () => null }));
vi.mock("@janjalive/webrtc", () => ({ playRoomCue: async () => {} }));

const room = {
  room: { id: "room", name: "Multilive QA", publicId: "room-public", code: "ABCD234", isOwner: true },
  access: "authorized", pending: [],
  members: ["owner", "Alice", "Bob"].map((userId) => ({ userId, name: userId, image: null, role: userId === "owner" ? "OWNER" : "MEMBER" })),
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, "janja", { configurable: true, value: {
    app: { getVersion: async () => "test", onRoomInvite: () => () => {} },
    auth: { getStatus: async () => ({ state: "signed-in", user: { id: "owner", name: "owner", image: null } }), onStatus: () => () => {} },
    updater: { getStatus: async () => ({ state: "idle" }), onStatus: () => () => {} },
    rooms: { list: async () => [{ id: "room", name: "Multilive QA", role: "OWNER", expiresInMs: 86400000 }], get: async () => room },
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
