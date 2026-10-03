export type WebDisplayCaptureOptions = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
};

export function getWebDisplayCaptureOptions(includeSystemAudio = true): WebDisplayCaptureOptions {
  return {
    video: true,
    audio: includeSystemAudio,
    systemAudio: includeSystemAudio ? "include" : "exclude",
  };
}
