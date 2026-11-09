import { afterEach, describe, expect, it, vi } from "vitest";
import { setPreferredVideoCodec } from "./codec-preference";

afterEach(() => vi.unstubAllGlobals());

describe("video codec preference", () => {
  const vp8 = { mimeType: "video/VP8", clockRate: 90_000 };
  const h264 = { mimeType: "video/H264", clockRate: 90_000, sdpFmtpLine: "profile-level-id=42e01f" };
  const h264High = { mimeType: "video/H264", clockRate: 90_000, sdpFmtpLine: "profile-level-id=64001f" };
  const rtx = { mimeType: "video/rtx", clockRate: 90_000 };
  const fec = { mimeType: "video/ulpfec", clockRate: 90_000 };

  function setup(codecs = [vp8, rtx, h264, fec, h264High]) {
    vi.stubGlobal("RTCRtpSender", { getCapabilities: () => ({ codecs }) });
    const setVideo = vi.fn();
    const setAudio = vi.fn();
    const peer = {
      getTransceivers: () => [
        { sender: { track: { kind: "video" } }, setCodecPreferences: setVideo },
        { sender: { track: { kind: "audio" } }, setCodecPreferences: setAudio },
      ],
    } as unknown as RTCPeerConnection;
    return { peer, codecs, setVideo, setAudio };
  }

  it("retains every fallback and repair codec without modifying capabilities or audio", () => {
    const { peer, codecs, setVideo, setAudio } = setup();
    expect(setPreferredVideoCodec(peer, "video/H264")).toBe(true);
    expect(setVideo).toHaveBeenCalledWith([h264, h264High, vp8, rtx, fec]);
    expect(codecs).toEqual([vp8, rtx, h264, fec, h264High]);
    expect(setAudio).not.toHaveBeenCalled();
  });

  it("keeps negotiation defaults when the requested codec is unavailable", () => {
    const { peer, setVideo } = setup([vp8, rtx, fec]);
    expect(setPreferredVideoCodec(peer, "video/H264")).toBe(false);
    expect(setVideo).not.toHaveBeenCalled();
  });

  it("allows negotiation to continue when preferences are rejected", () => {
    const { peer, setVideo } = setup();
    setVideo.mockImplementation(() => { throw new Error("NotSupportedError"); });
    expect(setPreferredVideoCodec(peer, "video/H264")).toBe(false);
  });

  it("supports environments without the codec preference APIs", () => {
    vi.stubGlobal("RTCRtpSender", undefined);
    expect(setPreferredVideoCodec({} as RTCPeerConnection, "video/H264")).toBe(false);
  });
});
