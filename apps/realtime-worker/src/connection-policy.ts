import type { ClientSignal } from "@janjalive/realtime-protocol";

export type SocketProtocol = "janjalive-v1" | "janjalive-v2";

export type MediaSessionState = {
  id: string;
  broadcasterUserId: string;
};

export type RevocationTransitionState = {
  changedAt: number;
  revoked: boolean;
  revokedAt?: number;
};

export type SignalingConnectionState = {
  userId: string;
  protocol: SocketProtocol;
  mediaSessions: MediaSessionState[];
  signalWindowStartedAt: number;
  signalCount: number;
};

export const MAX_MEDIA_SESSIONS_PER_CONNECTION = 4;
export const MAX_MEDIA_SESSIONS_PER_USER = 8;
export const SIGNAL_WINDOW_MS = 10_000;
export const MAX_SIGNALS_PER_WINDOW = 300;

const SESSION_SIGNAL_TYPES = new Set([
  "watch:request",
  "watch:stop",
  "webrtc:offer",
  "webrtc:answer",
  "webrtc:ice-candidate",
]);

export function isTokenRevoked(issuedAt: number, revokedAt: number | undefined) {
  return revokedAt !== undefined && issuedAt <= revokedAt;
}

export function applyRevocationTransition(
  current: RevocationTransitionState | undefined,
  action: "REVOKE" | "RESTORE",
  changedAt: number,
) {
  if (current && (current.changedAt > changedAt || (current.changedAt === changedAt && current.revoked))) {
    return current;
  }
  return action === "REVOKE"
    ? { changedAt, revoked: true, revokedAt: Math.floor(changedAt / 1_000) }
    : { changedAt, revoked: false };
}

export function activeRevocationCutoff(state: RevocationTransitionState | number | undefined) {
  if (typeof state === "number") return state;
  return state?.revoked ? state.revokedAt : undefined;
}

export function consumeSignalBudget(state: SignalingConnectionState, now: number) {
  if (now - state.signalWindowStartedAt >= SIGNAL_WINDOW_MS) {
    state.signalWindowStartedAt = now;
    state.signalCount = 0;
  }
  state.signalCount += 1;
  return state.signalCount <= MAX_SIGNALS_PER_WINDOW;
}

export function hasUserSignalBudget(states: SignalingConnectionState[], userId: string, now: number) {
  const count = states
    .filter((state) => state.userId === userId && now - state.signalWindowStartedAt < SIGNAL_WINDOW_MS)
    .reduce((total, state) => total + state.signalCount, 0);
  return count < MAX_SIGNALS_PER_WINDOW;
}

export function stripMediaSessionIdForLegacy(payload: ClientSignal): ClientSignal | Omit<ClientSignal, "mediaSessionId"> {
  if (!SESSION_SIGNAL_TYPES.has(payload.type) || !("mediaSessionId" in payload)) return payload;
  const legacyPayload = { ...payload } as ClientSignal & { mediaSessionId?: string };
  delete legacyPayload.mediaSessionId;
  return legacyPayload;
}

function viewerSession(
  states: SignalingConnectionState[],
  viewerUserId: string,
  broadcasterUserId: string,
  mediaSessionId: string,
) {
  return states.some((state) => state.userId === viewerUserId && state.mediaSessions.some(
    (session) => session.id === mediaSessionId && session.broadcasterUserId === broadcasterUserId,
  ));
}

export function resolveLegacyMediaSessionId(
  states: SignalingConnectionState[],
  sender: SignalingConnectionState,
  payload: ClientSignal,
) {
  if (!("mediaSessionId" in payload) || payload.type === "watch:request") return payload;
  const own = sender.mediaSessions.find((session) => session.broadcasterUserId === payload.targetUserId);
  if (own) return { ...payload, mediaSessionId: own.id };
  const remote = states.find((state) => state.userId === payload.targetUserId)?.mediaSessions.find(
    (session) => session.broadcasterUserId === sender.userId,
  );
  return remote ? { ...payload, mediaSessionId: remote.id } : payload;
}

export function authorizeMediaSignal(
  states: SignalingConnectionState[],
  sender: SignalingConnectionState,
  payload: ClientSignal,
) {
  if (!("mediaSessionId" in payload)) return true;
  if (payload.targetUserId === sender.userId) return false;

  if (payload.type === "watch:request") {
    const existing = sender.mediaSessions.find((session) => session.id === payload.mediaSessionId);
    if (existing) return existing.broadcasterUserId === payload.targetUserId;
    if (sender.mediaSessions.length >= MAX_MEDIA_SESSIONS_PER_CONNECTION) return false;
    const userSessionCount = states
      .filter((state) => state.userId === sender.userId)
      .reduce((count, state) => count + state.mediaSessions.length, 0);
    if (userSessionCount >= MAX_MEDIA_SESSIONS_PER_USER) return false;
    sender.mediaSessions.push({ id: payload.mediaSessionId, broadcasterUserId: payload.targetUserId });
    return true;
  }

  if (payload.type === "watch:stop" || payload.type === "webrtc:answer") {
    return viewerSession(states, sender.userId, payload.targetUserId, payload.mediaSessionId);
  }
  if (payload.type === "webrtc:offer") {
    return viewerSession(states, payload.targetUserId, sender.userId, payload.mediaSessionId);
  }
  return viewerSession(states, sender.userId, payload.targetUserId, payload.mediaSessionId)
    || viewerSession(states, payload.targetUserId, sender.userId, payload.mediaSessionId);
}

export function removeWatchedSession(state: SignalingConnectionState, payload: ClientSignal) {
  if (payload.type !== "watch:stop") return;
  state.mediaSessions = state.mediaSessions.filter((session) => session.id !== payload.mediaSessionId);
}

export function removeBroadcastSessions(state: SignalingConnectionState, broadcasterUserId: string) {
  state.mediaSessions = state.mediaSessions.filter((session) => session.broadcasterUserId !== broadcasterUserId);
}
