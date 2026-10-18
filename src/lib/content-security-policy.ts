export function getRealtimeWebSocketSource(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:") url.protocol = "ws:";
    else return null;

    return url.origin;
  } catch {
    return null;
  }
}
