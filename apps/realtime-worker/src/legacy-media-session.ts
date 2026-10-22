const SESSION_SIGNAL_TYPES = new Set([
  "watch:request",
  "watch:stop",
  "webrtc:offer",
  "webrtc:answer",
  "webrtc:ice-candidate",
]);

export async function normalizeLegacyMediaSessionId(raw: unknown, senderUserId: string) {
  if (!raw || typeof raw !== "object") return raw;
  const payload = raw as Record<string, unknown>;
  if (!SESSION_SIGNAL_TYPES.has(String(payload.type)) || payload.mediaSessionId !== undefined) return raw;
  if (typeof payload.targetUserId !== "string" || payload.targetUserId.length < 1 || payload.targetUserId.length > 128) return raw;

  // Old clients supported only one peer between a pair of users. A stable,
  // pair-scoped ID preserves that behavior while newer clients use independent
  // random IDs for inbound and outbound sessions.
  const pair = [senderUserId, payload.targetUserId].sort().join("\0");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pair));
  const suffix = [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { ...payload, mediaSessionId: `legacy_${suffix}` };
}
