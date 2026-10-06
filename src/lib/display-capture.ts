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
