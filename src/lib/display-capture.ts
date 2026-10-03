export type WebDisplayCaptureOptions = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
};

export function getWebDisplayCaptureOptions(): WebDisplayCaptureOptions {
  return {
    video: true,
    audio: true,
    systemAudio: "include",
  };
}
