export type WebDisplayCaptureOptions = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "system" | "window";
};

export function getWebDisplayCaptureOptions(includeSystemAudio = true): WebDisplayCaptureOptions {
  return {
    video: true,
    audio: includeSystemAudio,
    ...(includeSystemAudio ? {
      systemAudio: "include" as const,
      windowAudio: "system" as const,
    } : {}),
  };
}

export async function prepareDisplayCapture(options: WebDisplayCaptureOptions, constraints: MediaTrackConstraints, signal: AbortSignal) {
  signal.throwIfAborted();
  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  const stop = () => stream.getTracks().forEach((track) => track.stop());
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    for (const track of stream.getAudioTracks()) {
      if (track.readyState !== "live") { stream.removeTrack(track); track.stop(); }
    }
    const video = stream.getVideoTracks()[0];
    if (!video) throw new Error("CAPTURE_VIDEO_MISSING");
    await video.applyConstraints(constraints).catch(() => undefined);
    signal.throwIfAborted();
    return stream;
  } catch (error) {
    stop();
    throw error;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
