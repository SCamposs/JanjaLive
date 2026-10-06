export function getWebDisplayCaptureOptions(includeSystemAudio = true): DisplayMediaStreamOptions {
  return {
    video: true,
    audio: includeSystemAudio,
  };
}
