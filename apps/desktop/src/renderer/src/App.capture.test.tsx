// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  core: { roomUnavailable: false, onlineUserIds: ["owner"], membershipRevision: 0, activeStreams: [], remoteStreams: {}, viewerUserIds: [], connectionStatus: "good", connectionError: null, startBroadcast: vi.fn(), replaceBroadcast: vi.fn(), stopBroadcast: vi.fn() },
  selectSource: vi.fn(), getMedia: vi.fn(), startAudio: vi.fn(), stopAudio: vi.fn(),
}));
vi.mock("./use-room-media", () => ({ useRoomMedia: () => mocks.core }));
vi.mock("./native-audio", () => ({ startNativeAudioCapture: mocks.startAudio }));
vi.mock("./DesktopNoirBackdrop", () => ({ DesktopNoirBackdrop: () => null }));
vi.mock("@janjalive/webrtc", () => ({ playRoomCue: async () => {} }));

const source = { token: "source", name: "VALORANT", kind: "window", minimized: true, thumbnailDataUrl: "" };
const room = { room: { id: "room", name: "Capture QA", publicId: "room-public", code: "ABCD234", isOwner: true }, access: "authorized", pending: [], members: [{ userId: "owner", name: "Owner", image: null, role: "OWNER" }] };
let track: MediaStreamTrack;
let stream: MediaStream;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  track = Object.assign(new EventTarget(), { kind: "video", readyState: "live", stop: vi.fn(), applyConstraints: vi.fn().mockResolvedValue(undefined), getSettings: () => ({ width: 1920, height: 1080, frameRate: 60 }) }) as unknown as MediaStreamTrack;
  stream = { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] } as unknown as MediaStream;
  mocks.selectSource.mockResolvedValue(undefined); mocks.getMedia.mockResolvedValue(stream);
  mocks.startAudio.mockResolvedValue({ mode: "application", stop: mocks.stopAudio });
  mocks.core.startBroadcast.mockResolvedValue(undefined);
  Object.defineProperty(window, "janja", { configurable: true, value: {
    app: { getVersion: async () => "test", onRoomInvite: () => () => {} },
    auth: { getStatus: async () => ({ state: "signed-in", user: { id: "owner", name: "Owner", image: null } }), onStatus: () => () => {} },
    updater: { getStatus: async () => ({ state: "idle" }), onStatus: () => () => {} },
    rooms: { list: async () => [{ id: "room", name: "Capture QA", role: "OWNER", expiresInMs: 86400000 }], get: async () => room },
    capture: { listSources: async () => [source], selectSource: mocks.selectSource, cancelSelection: async () => {} },
  } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getDisplayMedia: mocks.getMedia } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("shows an invalid room code error without locking the home screen", async () => {
  const joinCode = vi.fn().mockRejectedValue(new Error("API_404"));
  window.janja.rooms.joinCode = joinCode;
  render(<App />);
  await screen.findByRole("button", { name: /^Capture QA/ });
  fireEvent.change(screen.getByLabelText("Código da sala, 7 caracteres"), { target: { value: "ABCD234" } });
  expect((await screen.findByRole("alert")).textContent).toContain("Sala não encontrada");
  expect((screen.getByLabelText("Código da sala, 7 caracteres") as HTMLInputElement).disabled).toBe(false);
});

async function choose() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /^Capture QA/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Compartilhar tela" }));
  fireEvent.click(await screen.findByRole("button", { name: /VALORANT/ }));
  await screen.findByRole("dialog", { name: "Configurar transmissão" });
}

it("configures a minimized application without restoring or capturing it before confirmation", async () => {
  await choose();
  expect(mocks.selectSource).not.toHaveBeenCalled();
  expect(mocks.getMedia).not.toHaveBeenCalled();
  expect(mocks.startAudio).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.core.startBroadcast).not.toHaveBeenCalled();
});

it("offers playback recovery instead of waiting forever when autoplay is blocked", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
  await choose();
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
  expect(await screen.findByRole("button", { name: "Reproduzir" })).toBeTruthy();
});

it("restores, captures and publishes in one confirmation using the selected FPS", async () => {
  await choose();
  fireEvent.click(screen.getByRole("radio", { name: "30" }));
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
  await waitFor(() => expect(mocks.core.startBroadcast).toHaveBeenCalledOnce());
  expect(mocks.selectSource).toHaveBeenCalledOnce();
  expect(mocks.getMedia).toHaveBeenCalledWith({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
  expect(mocks.startAudio).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog", { name: "Configurar transmissão" })).toBeNull();
  expect(await screen.findByRole("button", { name: "Trocar tela" })).toBeTruthy();
  const preview = document.querySelector(".desktop-player video") as HTMLVideoElement;
  expect(preview.muted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ativar som" }));
  expect(preview.muted).toBe(false);
});

it("cancels an in-flight restore without opening display capture when it completes late", async () => {
  let finish!: () => void;
  mocks.selectSource.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await choose();
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
  await waitFor(() => expect(mocks.selectSource).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.getMedia).not.toHaveBeenCalled();
  expect(mocks.core.startBroadcast).not.toHaveBeenCalled();
});

it("preserves live preview before confirmation for ordinary unminimized windows", async () => {
  source.minimized = false;
  try {
    await choose();
    expect(mocks.getMedia).toHaveBeenCalledOnce();
    expect(mocks.core.startBroadcast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
    await waitFor(() => expect(mocks.core.startBroadcast).toHaveBeenCalledOnce());
    expect(mocks.getMedia).toHaveBeenCalledOnce();
  } finally { source.minimized = true; }
});
