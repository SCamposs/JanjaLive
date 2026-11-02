export async function acquireCapture(select: () => Promise<void>, getMedia: () => Promise<MediaStream>, signal: AbortSignal) {
  signal.throwIfAborted();
  await select();
  signal.throwIfAborted();
  const stream = await getMedia();
  if (signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    signal.throwIfAborted();
  }
  return stream;
}
