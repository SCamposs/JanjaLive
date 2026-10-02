const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function isDesktopVersionSupported(current: string | null, minimum: string | undefined) {
  if (!minimum) return true;
  const currentMatch = current?.match(STABLE_VERSION);
  const minimumMatch = minimum.match(STABLE_VERSION);
  if (!currentMatch || !minimumMatch) return false;
  for (let index = 1; index <= 3; index += 1) {
    const currentPart = Number(currentMatch[index]);
    const minimumPart = Number(minimumMatch[index]);
    if (currentPart !== minimumPart) return currentPart > minimumPart;
  }
  return true;
}
