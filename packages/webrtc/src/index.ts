"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  realtimeSocketMessageSchema,
  type RealtimeSession,
} from "@janjalive/realtime-protocol";

export { playRoomCue } from "./ui-sounds";

export type QualityPreset =
  | "720p30"
  | "720p60"
  | "1080p30"
  | "1080p60"
  | "1440p30"
  | "1440p60"
  | "source";

export type StreamMetadata = {
  preset: QualityPreset;
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
};

export type ActiveStream = StreamMetadata & {
  streamerUserId: string;
  startedAt: number;
};

type MediaDiagnostic = {
  event: string;
  elapsedMs: number;
  details?: Record<string, string | number | boolean>;
};

const mediaDiagnosticStartedAt = Date.now();
const mediaDiagnostics: MediaDiagnostic[] = [];

function traceMedia(event: string, details?: MediaDiagnostic["details"]) {
  if (process.env.NODE_ENV === "test") return;
  const diagnostic = { event, elapsedMs: Date.now() - mediaDiagnosticStartedAt, ...(details ? { details } : {}) };
  mediaDiagnostics.push(diagnostic);
  if (mediaDiagnostics.length > 200) mediaDiagnostics.shift();
  globalThis.console?.info?.("[JanjaLive media]", diagnostic);
}

export function getMediaDiagnostics() {
  return [...mediaDiagnostics];
}

type SessionDescription = { type: "offer" | "answer"; sdp: string };
type IceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type ClientSignal =
  | { type: "presence:join" | "presence:leave" | "stream:stop" }
  | { type: "stream:start"; metadata: StreamMetadata }
  | { type: "watch:request" | "watch:stop"; targetUserId: string; mediaSessionId: string }
  | { type: "webrtc:offer" | "webrtc:answer"; targetUserId: string; mediaSessionId: string; description: SessionDescription }
  | { type: "webrtc:ice-candidate"; targetUserId: string; mediaSessionId: string; candidate: IceCandidate };

export type ServerSignal =
  | ClientSignal
  | { type: "room:join-request" | "room:closed" }
  | { type: "room:approved" | "room:rejected" | "room:revoked"; targetUserId: string };

export type RealtimePoll = {
  events: Array<{
    id: string;
    senderUserId: string;
    sentAt: number;
    cursor: number;
    payload: ServerSignal;
  }>;
  onlineUserIds: string[];
  activeStreams: ActiveStream[];
  cursor: number;
};

export type RoomMediaTransport = {
  send(roomId: string, payload: ClientSignal): Promise<void>;
  poll(roomId: string, since: number): Promise<RealtimePoll>;
  getIceServers(roomId: string): Promise<RTCIceServer[]>;
  isRoomUnavailable(error: unknown): boolean;
  getPollInterval?(states: RTCPeerConnectionState[]): number;
  close?(roomId: string): void;
};

type AdaptiveTransportOptions = {
  getSession(roomId: string): Promise<RealtimeSession>;
  legacySend(roomId: string, payload: ClientSignal): Promise<void>;
  legacyPoll(roomId: string, since: number): Promise<RealtimePoll>;
  getIceServers(roomId: string): Promise<RTCIceServer[]>;
  isRoomUnavailable(error: unknown): boolean;
};

export function createAdaptiveRoomMediaTransport(options: AdaptiveTransportOptions): RoomMediaTransport {
  let roomId: string | null = null;
  let provider: RealtimeSession["provider"] | null = null;
  let pendingSession: RealtimeSession | null = null;
  let socket: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  let connectionGeneration = 0;
  let onlineUserIds: string[] = [];
  let activeStreams: ActiveStream[] = [];
  let events: RealtimePoll["events"] = [];
  let cursor = 0;
  let snapshotRevision = 0;
  let deliveredRevision = -1;
  let hasConnected = false;
  let joined = false;
  let desiredPublication: StreamMetadata | null = null;
  const desiredWatchRequests = new Map<string, { targetUserId: string; mediaSessionId: string }>();
  const waiters = new Set<{ resolve: (value: RealtimePoll) => void; reject: (error: Error) => void }>();

  const snapshot = (since: number): RealtimePoll => ({
    events: events.filter((event) => event.cursor > since),
    onlineUserIds,
    activeStreams,
    cursor,
  });

  const flush = () => {
    for (const waiter of waiters) waiter.resolve(snapshot(0));
    waiters.clear();
  };

  const fail = (error: Error) => {
    for (const waiter of waiters) waiter.reject(error);
    waiters.clear();
  };

  const resetRoom = (nextRoomId: string) => {
    if (roomId === nextRoomId) return;
    socket?.close(1000, "Room changed");
    roomId = nextRoomId;
    provider = null;
    pendingSession = null;
    socket = null;
    connecting = null;
    connectionGeneration += 1;
    onlineUserIds = [];
    activeStreams = [];
    events = [];
    cursor = 0;
    snapshotRevision = 0;
    deliveredRevision = -1;
    hasConnected = false;
    joined = false;
    desiredPublication = null;
    desiredWatchRequests.clear();
    fail(new Error("ROOM_CHANGED"));
  };

  const ensureProvider = async (targetRoomId: string) => {
    resetRoom(targetRoomId);
    if (!provider) {
      pendingSession = await options.getSession(targetRoomId);
      provider = pendingSession.provider;
    }
    return provider;
  };

  const connect = async (targetRoomId: string) => {
    resetRoom(targetRoomId);
    if (socket?.readyState === WebSocket.OPEN) return socket;
    if (connecting) return connecting;
    const generation = ++connectionGeneration;
    connecting = (async () => {
      const reconnecting = hasConnected;
      let session: RealtimeSession;
      try {
        session = pendingSession ?? await options.getSession(targetRoomId);
      } catch (error) {
        traceMedia("realtime.session.failed");
        throw error;
      }
      pendingSession = null;
      provider = session.provider;
      if (session.provider !== "cloudflare") throw new Error("REALTIME_PROVIDER_MISMATCH");
      const websocketUrl = new URL("/connect", session.url);
      websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
      const candidate = new WebSocket(websocketUrl, ["janjalive-v2", `janjalive-token.${session.token}`]);
      candidate.addEventListener("message", (message) => {
        if (generation !== connectionGeneration) return;
        try {
          const parsed = realtimeSocketMessageSchema.safeParse(JSON.parse(String(message.data)));
          if (!parsed.success) return;
          if (parsed.data.type === "snapshot") {
            onlineUserIds = parsed.data.onlineUserIds;
            activeStreams = parsed.data.activeStreams;
            snapshotRevision += 1;
          } else {
            events = [...events, parsed.data.event].slice(-400);
            cursor = Math.max(cursor, parsed.data.event.cursor);
          }
          flush();
        } catch {
          // Ignore malformed server messages; a valid connection remains usable.
        }
      });
      candidate.addEventListener("close", (event) => {
        if (generation !== connectionGeneration) return;
        traceMedia("realtime.socket.closed", { code: event.code, clean: event.wasClean });
        if (socket === candidate) socket = null;
        connecting = null;
        fail(new Error(event.code === 4003 || event.code === 4004 ? "API_403" : "REALTIME_DISCONNECTED"));
      });
      candidate.addEventListener("error", () => {
        if (generation === connectionGeneration) fail(new Error("REALTIME_DISCONNECTED"));
      });
      await new Promise<void>((resolve, reject) => {
        const opened = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("REALTIME_CONNECT_FAILED")); };
        const closed = () => { cleanup(); reject(new Error("REALTIME_DISCONNECTED")); };
        const cleanup = () => {
          candidate.removeEventListener("open", opened);
          candidate.removeEventListener("error", failed);
          candidate.removeEventListener("close", closed);
        };
        candidate.addEventListener("open", opened, { once: true });
        candidate.addEventListener("error", failed, { once: true });
        candidate.addEventListener("close", closed, { once: true });
      });
      if (generation !== connectionGeneration) {
        candidate.close(1000, "Superseded");
        throw new Error("REALTIME_CONNECTION_SUPERSEDED");
      }
      socket = candidate;
      traceMedia("realtime.socket.opened", { reconnecting });
      if (reconnecting) {
        if (joined) candidate.send(JSON.stringify({ type: "signal", payload: { type: "presence:join" } }));
        if (desiredPublication) {
          candidate.send(JSON.stringify({
            type: "signal",
            payload: { type: "stream:start", metadata: desiredPublication },
          }));
        }
        for (const request of desiredWatchRequests.values()) {
          candidate.send(JSON.stringify({ type: "signal", payload: { type: "watch:request", ...request } }));
        }
        traceMedia("realtime.state.replayed", {
          publication: Boolean(desiredPublication),
          watchCount: desiredWatchRequests.size,
        });
      }
      hasConnected = true;
      return candidate;
    })();
    try {
      return await connecting;
    } finally {
      if (generation === connectionGeneration) connecting = null;
    }
  };

  return {
    async send(targetRoomId, payload) {
      const selectedProvider = await ensureProvider(targetRoomId);
      if (selectedProvider === "upstash") return options.legacySend(targetRoomId, payload);
      if (payload.type === "presence:join") joined = true;
      else if (payload.type === "presence:leave") joined = false;
      else if (payload.type === "stream:start") desiredPublication = payload.metadata;
      else if (payload.type === "stream:stop") desiredPublication = null;
      else if (payload.type === "watch:request") {
        desiredWatchRequests.set(payload.mediaSessionId, {
          targetUserId: payload.targetUserId,
          mediaSessionId: payload.mediaSessionId,
        });
      } else if (payload.type === "watch:stop") {
        desiredWatchRequests.delete(payload.mediaSessionId);
      }
      const currentSocket = await connect(targetRoomId);
      currentSocket.send(JSON.stringify({ type: "signal", payload }));
    },
    async poll(targetRoomId, since) {
      const selectedProvider = await ensureProvider(targetRoomId);
      if (selectedProvider === "upstash") return options.legacyPoll(targetRoomId, since);
      await connect(targetRoomId);
      if (events.some((event) => event.cursor > since) || snapshotRevision > deliveredRevision) {
        deliveredRevision = snapshotRevision;
        return snapshot(since);
      }
      return await new Promise<RealtimePoll>((resolve, reject) => {
        waiters.add({
          resolve: (value) => {
            deliveredRevision = snapshotRevision;
            resolve({ ...value, events: value.events.filter((event) => event.cursor > since) });
          },
          reject,
        });
      });
    },
    getIceServers: options.getIceServers,
    isRoomUnavailable: options.isRoomUnavailable,
    getPollInterval(states) {
      return provider === "cloudflare" ? 0 : getRoomPollInterval(states);
    },
    close(targetRoomId) {
      if (roomId !== targetRoomId) return;
      const current = socket;
      socket = null;
      connecting = null;
      connectionGeneration += 1;
      hasConnected = false;
      joined = false;
      desiredPublication = null;
      desiredWatchRequests.clear();
      current?.close(1000, "Left room");
      fail(new Error("REALTIME_CLOSED"));
    },
  };
}

export type RoomSignalDirective = {
  membershipChanged: boolean;
  roomUnavailable: boolean;
};

export function getRoomSignalDirective(payload: ServerSignal): RoomSignalDirective {
  if (payload.type === "room:closed" || payload.type === "room:revoked") {
    return { membershipChanged: true, roomUnavailable: true };
  }
  return {
    membershipChanged: payload.type.startsWith("room:"),
    roomUnavailable: false,
  };
}

export function getReconnectDelay(failures: number) {
  return Math.min(12_000, 1_000 * 2 ** Math.max(1, failures));
}

type UseRoomMediaOptions = {
  roomId: string | null;
  transport: RoomMediaTransport;
  initialOnlineUserIds?: string[];
};

export type ConnectionStatus = "connecting" | "good" | "unstable" | "reconnecting";

type PeerDirection = "inbound" | "outbound";
type PeerSession = {
  id: string;
  remoteUserId: string;
  direction: PeerDirection;
  peer: RTCPeerConnection;
};
export type PendingCandidateSession = {
  remoteUserId: string;
  candidates: RTCIceCandidateInit[];
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }];
const EMPTY_USER_IDS: string[] = [];
const PEER_CONNECTION_TIMEOUT_MS = 20_000;
const WATCH_RETRY_INTERVAL_MS = 3_000;
export const MAX_PEER_SESSIONS_PER_REMOTE = 4;
export const MAX_TOTAL_PEER_SESSIONS = 24;
export const MAX_PENDING_MEDIA_SESSIONS = 16;
export const MAX_PENDING_MEDIA_SESSIONS_PER_REMOTE = 4;
export const MAX_PENDING_CANDIDATES_PER_SESSION = 32;
export const STREAM_SNAPSHOT_GRACE_MS = 8_000;
const IDLE_POLL_INTERVAL_MS = 1_500;
const NEGOTIATING_POLL_INTERVAL_MS = 300;

export function queuePendingCandidate(
  pendingSessions: Map<string, PendingCandidateSession>,
  mediaSessionId: string,
  remoteUserId: string,
  candidate: RTCIceCandidateInit,
) {
  const pending = pendingSessions.get(mediaSessionId);
  if (pending && pending.remoteUserId !== remoteUserId) return false;
  if (!pending) {
    const pendingForRemote = [...pendingSessions.values()].filter(
      (session) => session.remoteUserId === remoteUserId,
    ).length;
    if (
      pendingSessions.size >= MAX_PENDING_MEDIA_SESSIONS
      || pendingForRemote >= MAX_PENDING_MEDIA_SESSIONS_PER_REMOTE
    ) return false;
  }
  const candidates = pending?.candidates ?? [];
  if (candidates.length >= MAX_PENDING_CANDIDATES_PER_SESSION) return false;
  pendingSessions.set(mediaSessionId, { remoteUserId, candidates: [...candidates, candidate] });
  return true;
}

export function getRoomPollInterval(states: RTCPeerConnectionState[]) {
  return states.some((state) => state === "new" || state === "connecting")
    ? NEGOTIATING_POLL_INTERVAL_MS
    : IDLE_POLL_INTERVAL_MS;
}

export function shouldPauseRoomPolling(
  visibilityState: DocumentVisibilityState,
  hasLocalStream: boolean,
  peerCount: number,
) {
  return visibilityState === "hidden" && !hasLocalStream && peerCount === 0;
}

export function getPeerConnectionStatus(states: RTCPeerConnectionState[]): ConnectionStatus {
  if (states.length === 0 || states.some((state) => state === "connected")) return "good";
  if (states.some((state) => state === "failed" || state === "disconnected")) return "unstable";
  return "connecting";
}

export function isTransientPeerSignal(payload: ServerSignal) {
  return payload.type === "watch:request" ||
    payload.type === "watch:stop" ||
    payload.type === "webrtc:offer" ||
    payload.type === "webrtc:answer" ||
    payload.type === "webrtc:ice-candidate";
}

export function shouldApplyRemoteAnswer(
  signalingState: RTCSignalingState,
  currentDescription: RTCSessionDescription | null,
  incomingDescription: SessionDescription,
) {
  if (
    signalingState === "stable" &&
    currentDescription?.type === "answer" &&
    currentDescription.sdp === incomingDescription.sdp
  ) return false;
  return signalingState === "have-local-offer";
}

export async function replacePeerTracks(peer: RTCPeerConnection, stream: MediaStream, bitrate: number) {
  const nextTracks = new Map(stream.getTracks().map((track) => [track.kind, track]));
  const senders = peer.getSenders();
  const existingKinds = new Set(senders.flatMap((sender) => sender.track ? [sender.track.kind] : []));
  let needsNegotiation = false;

  for (const sender of senders) {
    const currentTrack = sender.track;
    if (!currentTrack) continue;
    const nextTrack = nextTracks.get(currentTrack.kind) ?? null;
    if (nextTrack !== currentTrack) await sender.replaceTrack(nextTrack);
    if (!nextTrack) needsNegotiation = true;
  }
  for (const track of stream.getTracks()) {
    if (existingKinds.has(track.kind)) continue;
    peer.addTrack(track, stream);
    needsNegotiation = true;
  }
  const videoSender = peer.getSenders().find((sender) => sender.track?.kind === "video");
  if (videoSender) {
    const parameters = videoSender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    if (parameters.encodings[0]) parameters.encodings[0].maxBitrate = bitrate;
    await videoSender.setParameters(parameters).catch(() => undefined);
  }
  return needsNegotiation;
}

export function useRoomMediaCore({ roomId, transport, initialOnlineUserIds }: UseRoomMediaOptions) {
  const initialOnline = initialOnlineUserIds ?? EMPTY_USER_IDS;
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(initialOnline);
  const [activeStreams, setActiveStreams] = useState<ActiveStream[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [membershipRevision, setMembershipRevision] = useState(0);
  const peersRef = useRef(new Map<string, PeerSession>());
  const inboundSessionByStreamerRef = useRef(new Map<string, string>());
  const peerTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const watchRetryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingCandidatesRef = useRef(new Map<string, PendingCandidateSession>());
  const pendingWatchersRef = useRef(new Map<string, string>());
  const remoteStreamRefs = useRef(new Map<string, MediaStream>());
  const activeStreamsRef = useRef<ActiveStream[]>([]);
  const latestSnapshotStreamerIdsRef = useRef(new Set<string>());
  const streamGraceTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const bitrateRef = useRef(10_000_000);
  const sinceRef = useRef(0);
  const pollWakeRef = useRef<(() => void) | null>(null);
  const iceServersRef = useRef<{ roomId: string; promise: Promise<RTCIceServer[]> } | null>(null);

  const send = useCallback(async (payload: ClientSignal) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    await transport.send(roomId, payload);
  }, [roomId, transport]);

  const closePeer = useCallback((mediaSessionId: string) => {
    const session = peersRef.current.get(mediaSessionId);
    const timer = peerTimersRef.current.get(mediaSessionId);
    if (timer) clearTimeout(timer);
    const watchRetryTimer = watchRetryTimersRef.current.get(mediaSessionId);
    if (watchRetryTimer) clearTimeout(watchRetryTimer);
    peerTimersRef.current.delete(mediaSessionId);
    watchRetryTimersRef.current.delete(mediaSessionId);
    pendingWatchersRef.current.delete(mediaSessionId);
    session?.peer.close();
    peersRef.current.delete(mediaSessionId);
    pendingCandidatesRef.current.delete(mediaSessionId);
    if (!session || session.direction !== "inbound") return;
    if (inboundSessionByStreamerRef.current.get(session.remoteUserId) === mediaSessionId) {
      inboundSessionByStreamerRef.current.delete(session.remoteUserId);
    }
    remoteStreamRefs.current.delete(session.remoteUserId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[session.remoteUserId];
      return next;
    });
  }, []);

  const closePeers = useCallback((predicate: (session: PeerSession) => boolean) => {
    for (const session of [...peersRef.current.values()]) {
      if (predicate(session)) closePeer(session.id);
    }
  }, [closePeer]);

  const closeAllPeers = useCallback(() => {
    for (const { peer } of peersRef.current.values()) peer.close();
    for (const timer of peerTimersRef.current.values()) clearTimeout(timer);
    for (const timer of watchRetryTimersRef.current.values()) clearTimeout(timer);
    peersRef.current.clear();
    inboundSessionByStreamerRef.current.clear();
    peerTimersRef.current.clear();
    watchRetryTimersRef.current.clear();
    pendingCandidatesRef.current.clear();
    pendingWatchersRef.current.clear();
    remoteStreamRefs.current.clear();
    for (const timer of streamGraceTimersRef.current.values()) clearTimeout(timer);
    streamGraceTimersRef.current.clear();
    setRemoteStreams({});
  }, []);

  const stopLocalCapture = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const makeRoomUnavailable = useCallback(() => {
    stopLocalCapture();
    closeAllPeers();
    activeStreamsRef.current = [];
    latestSnapshotStreamerIdsRef.current.clear();
    setActiveStreams([]);
    setOnlineUserIds([]);
    setRoomUnavailable(true);
  }, [closeAllPeers, stopLocalCapture]);

  const resolveIceServers = useCallback(() => {
    if (!roomId) return Promise.resolve(FALLBACK_ICE_SERVERS);
    if (iceServersRef.current?.roomId === roomId) return iceServersRef.current.promise;
    const promise = transport.getIceServers(roomId).catch(() => FALLBACK_ICE_SERVERS);
    iceServersRef.current = { roomId, promise };
    return promise;
  }, [roomId, transport]);

  const reconcileActiveStreams = useCallback((nextStreams: ActiveStream[]) => {
    const nextIds = new Set(nextStreams.map((stream) => stream.streamerUserId));
    latestSnapshotStreamerIdsRef.current = nextIds;
    for (const stream of nextStreams) {
      const timer = streamGraceTimersRef.current.get(stream.streamerUserId);
      if (timer) {
        clearTimeout(timer);
        traceMedia("stream.snapshot.restored");
      }
      streamGraceTimersRef.current.delete(stream.streamerUserId);
    }
    const retained = activeStreamsRef.current.filter((stream) => {
      if (nextIds.has(stream.streamerUserId)) return false;
      if (!streamGraceTimersRef.current.has(stream.streamerUserId)) {
        traceMedia("stream.snapshot.temporarily_missing");
        streamGraceTimersRef.current.set(stream.streamerUserId, setTimeout(() => {
          streamGraceTimersRef.current.delete(stream.streamerUserId);
          if (latestSnapshotStreamerIdsRef.current.has(stream.streamerUserId)) return;
          activeStreamsRef.current = activeStreamsRef.current.filter(
            (current) => current.streamerUserId !== stream.streamerUserId,
          );
          setActiveStreams(activeStreamsRef.current);
          traceMedia("stream.snapshot.expired_after_grace");
        }, STREAM_SNAPSHOT_GRACE_MS));
      }
      return true;
    });
    activeStreamsRef.current = [...nextStreams, ...retained];
    setActiveStreams(activeStreamsRef.current);
  }, []);

  const createPeer = useCallback(async (mediaSessionId: string, remoteUserId: string, direction: PeerDirection) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    const current = peersRef.current.get(mediaSessionId);
    if (current && current.peer.connectionState !== "closed") {
      return current.remoteUserId === remoteUserId && current.direction === direction ? current.peer : null;
    }
    const peerCountForRemote = [...peersRef.current.values()].filter(
      (session) => session.remoteUserId === remoteUserId && session.peer.connectionState !== "closed",
    ).length;
    const totalPeerCount = [...peersRef.current.values()].filter(
      (session) => session.peer.connectionState !== "closed",
    ).length;
    if (peerCountForRemote >= MAX_PEER_SESSIONS_PER_REMOTE || totalPeerCount >= MAX_TOTAL_PEER_SESSIONS) return null;

    const iceServers = await resolveIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    peersRef.current.set(mediaSessionId, { id: mediaSessionId, remoteUserId, direction, peer });
    if (direction === "inbound") inboundSessionByStreamerRef.current.set(remoteUserId, mediaSessionId);
    const releaseInboundSession = () => {
      if (direction !== "inbound") return;
      void send({ type: "watch:stop", targetUserId: remoteUserId, mediaSessionId }).catch(() => undefined);
    };
    peerTimersRef.current.set(mediaSessionId, setTimeout(() => {
      if (peersRef.current.get(mediaSessionId)?.peer !== peer || peer.connectionState === "connected") return;
      setConnectionStatus("unstable");
      if (direction === "inbound") setConnectionError("Não foi possível conectar a esta transmissão. Tente novamente.");
      releaseInboundSession();
      closePeer(mediaSessionId);
    }, PEER_CONNECTION_TIMEOUT_MS));
    peer.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const candidateInit = candidate.toJSON();
      void send({
        type: "webrtc:ice-candidate",
        targetUserId: remoteUserId,
        mediaSessionId,
        candidate: {
          candidate: candidateInit.candidate ?? "",
          sdpMid: candidateInit.sdpMid,
          sdpMLineIndex: candidateInit.sdpMLineIndex,
          usernameFragment: candidateInit.usernameFragment,
        },
      }).catch(() => setConnectionStatus("unstable"));
    };
    peer.ontrack = ({ track, streams }) => {
      if (direction !== "inbound") return;
      const incomingStream = streams[0];
      const stream = remoteStreamRefs.current.get(remoteUserId) ?? incomingStream ?? new MediaStream();
      remoteStreamRefs.current.set(remoteUserId, stream);
      if (!stream.getTracks().some((currentTrack) => currentTrack.id === track.id)) stream.addTrack(track);
      if (track.kind !== "video") return;
      const publishStream = () => {
        if (peersRef.current.get(mediaSessionId)?.peer !== peer) return;
        setRemoteStreams((currentStreams) => ({ ...currentStreams, [remoteUserId]: stream }));
      };
      if (track.muted) track.addEventListener("unmute", publishStream, { once: true });
      else publishStream();
    };
    peer.onconnectionstatechange = () => {
      traceMedia("peer.connection.changed", { direction, state: peer.connectionState });
      if (peer.connectionState === "connected") {
        const timer = peerTimersRef.current.get(mediaSessionId);
        if (timer) clearTimeout(timer);
        peerTimersRef.current.delete(mediaSessionId);
        const watchRetryTimer = watchRetryTimersRef.current.get(mediaSessionId);
        if (watchRetryTimer) clearTimeout(watchRetryTimer);
        watchRetryTimersRef.current.delete(mediaSessionId);
        setConnectionStatus("good");
        setConnectionError(null);
      } else if (peer.connectionState === "new" || peer.connectionState === "connecting") {
        setConnectionStatus("connecting");
      } else if (peer.connectionState === "disconnected") {
        setConnectionStatus("unstable");
      } else if (peer.connectionState === "failed") {
        setConnectionStatus("unstable");
        if (direction === "inbound") setConnectionError("Não foi possível conectar a esta transmissão.");
        releaseInboundSession();
        closePeer(mediaSessionId);
      }
    };
    return peer;
  }, [closePeer, resolveIceServers, roomId, send]);

  const offerBroadcastTo = useCallback(async (remoteUserId: string, mediaSessionId: string) => {
    const stream = localStreamRef.current;
    if (!stream) {
      const pendingForRemote = [...pendingWatchersRef.current.values()].filter((userId) => userId === remoteUserId).length;
      if (
        pendingWatchersRef.current.size >= MAX_PENDING_MEDIA_SESSIONS
        || (!pendingWatchersRef.current.has(mediaSessionId) && pendingForRemote >= MAX_PENDING_MEDIA_SESSIONS_PER_REMOTE)
      ) return;
      pendingWatchersRef.current.set(mediaSessionId, remoteUserId);
      return;
    }
    pendingWatchersRef.current.delete(mediaSessionId);
    const peer = await createPeer(mediaSessionId, remoteUserId, "outbound");
    if (!peer) return;
    if (peer.getSenders().length === 0) {
      for (const track of stream.getTracks()) {
        const sender = peer.addTrack(track, stream);
        if (track.kind === "video") {
          const parameters = sender.getParameters();
          parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
          const [encoding] = parameters.encodings;
          if (encoding) encoding.maxBitrate = bitrateRef.current;
          await sender.setParameters(parameters).catch(() => undefined);
        }
      }
    }

    if (peer.signalingState === "have-local-offer" && peer.localDescription?.type === "offer") {
      await send({
        type: "webrtc:offer",
        targetUserId: remoteUserId,
        mediaSessionId,
        description: { type: "offer", sdp: peer.localDescription.sdp ?? "" },
      });
      return;
    }
    if (peer.signalingState !== "stable") return;
    const description = await peer.createOffer();
    await peer.setLocalDescription(description);
    await send({
      type: "webrtc:offer",
      targetUserId: remoteUserId,
      mediaSessionId,
      description: { type: "offer", sdp: description.sdp ?? "" },
    });
  }, [createPeer, send]);

  const handleSignal = useCallback(async (senderUserId: string, payload: ServerSignal) => {
    const directive = getRoomSignalDirective(payload);
    if (directive.membershipChanged) setMembershipRevision((value) => value + 1);
    if (directive.roomUnavailable) {
      makeRoomUnavailable();
      return true;
    }
    const applyPendingCandidates = async (peer: RTCPeerConnection) => {
      if (!("mediaSessionId" in payload)) return;
      const pending = pendingCandidatesRef.current.get(payload.mediaSessionId);
      pendingCandidatesRef.current.delete(payload.mediaSessionId);
      if (!pending || pending.remoteUserId !== senderUserId) return;
      for (const candidate of pending.candidates) await peer.addIceCandidate(candidate);
    };

    if (payload.type === "watch:request") {
      await offerBroadcastTo(senderUserId, payload.mediaSessionId);
    } else if (payload.type === "watch:stop") {
      const session = peersRef.current.get(payload.mediaSessionId);
      if (session?.direction === "outbound" && session.remoteUserId === senderUserId) closePeer(payload.mediaSessionId);
    } else if (payload.type === "stream:stop") {
      traceMedia("stream.explicit_stop.received");
      closePeers((session) => session.direction === "inbound" && session.remoteUserId === senderUserId);
      const timer = streamGraceTimersRef.current.get(senderUserId);
      if (timer) clearTimeout(timer);
      streamGraceTimersRef.current.delete(senderUserId);
      activeStreamsRef.current = activeStreamsRef.current.filter((stream) => stream.streamerUserId !== senderUserId);
      setActiveStreams(activeStreamsRef.current);
    } else if (payload.type === "webrtc:offer") {
      const peer = await createPeer(payload.mediaSessionId, senderUserId, "inbound");
      if (!peer) return false;
      if (
        peer.remoteDescription?.type === "offer" &&
        peer.remoteDescription.sdp === payload.description.sdp &&
        peer.localDescription?.type === "answer"
      ) {
        await send({
          type: "webrtc:answer",
          targetUserId: senderUserId,
          mediaSessionId: payload.mediaSessionId,
          description: { type: "answer", sdp: peer.localDescription.sdp ?? "" },
        });
        return false;
      }
      if (peer.signalingState !== "stable") return false;
      await peer.setRemoteDescription(payload.description);
      await applyPendingCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await send({
        type: "webrtc:answer",
        targetUserId: senderUserId,
        mediaSessionId: payload.mediaSessionId,
        description: { type: "answer", sdp: answer.sdp ?? "" },
      });
    } else if (payload.type === "webrtc:answer") {
      const session = peersRef.current.get(payload.mediaSessionId);
      if (session?.direction === "outbound" && session.remoteUserId === senderUserId && shouldApplyRemoteAnswer(session.peer.signalingState, session.peer.remoteDescription, payload.description)) {
        await session.peer.setRemoteDescription(payload.description);
        await applyPendingCandidates(session.peer);
      }
    } else if (payload.type === "webrtc:ice-candidate") {
      const existing = peersRef.current.get(payload.mediaSessionId);
      if (existing) {
        if (existing.remoteUserId !== senderUserId) return false;
        if (existing.peer.remoteDescription) await existing.peer.addIceCandidate(payload.candidate);
        else queuePendingCandidate(pendingCandidatesRef.current, payload.mediaSessionId, senderUserId, payload.candidate);
      } else {
        queuePendingCandidate(pendingCandidatesRef.current, payload.mediaSessionId, senderUserId, payload.candidate);
      }
    }
    return false;
  }, [closePeer, closePeers, createPeer, makeRoomUnavailable, offerBroadcastTo, send]);

  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let failures = 0;
    let hasSynced = false;
    sinceRef.current = 0;
    iceServersRef.current = null;
    void resolveIceServers();
    const resetState = setTimeout(() => {
      setRoomUnavailable(false);
      setConnectionError(null);
      setConnectionStatus("connecting");
      setOnlineUserIds(initialOnline);
      activeStreamsRef.current = [];
      latestSnapshotStreamerIdsRef.current.clear();
      setActiveStreams([]);
      setRemoteStreams({});
      void send({ type: "presence:join" }).catch(() => undefined);
      void poll();
    }, 0);

    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const data = await transport.poll(roomId, sinceRef.current);
        failures = 0;
        setOnlineUserIds(data.onlineUserIds);
        reconcileActiveStreams(data.activeStreams);
        for (const event of data.events) {
          // Establish a fresh session cursor without replaying retained peer
          // negotiation from an earlier visit to the room.
          if (!hasSynced && isTransientPeerSignal(event.payload)) continue;
          try {
            if (await handleSignal(event.senderUserId, event.payload)) return;
          } catch {
            setConnectionStatus(hasSynced ? "reconnecting" : "connecting");
          }
        }
        sinceRef.current = Math.max(sinceRef.current, data.cursor);
        hasSynced = true;
        const peerStates = [...peersRef.current.values()].map(({ peer }) => peer.connectionState);
        setConnectionStatus(getPeerConnectionStatus(peerStates));
        if (!shouldPauseRoomPolling(document.visibilityState, Boolean(localStreamRef.current), peersRef.current.size)) {
          timeout = setTimeout(poll, transport.getPollInterval?.(peerStates) ?? getRoomPollInterval(peerStates));
        }
      } catch (error) {
        failures += 1;
        setConnectionStatus(hasSynced ? "reconnecting" : "connecting");
        if (transport.isRoomUnavailable(error)) {
          makeRoomUnavailable();
          return;
        }
        if (!shouldPauseRoomPolling(document.visibilityState, Boolean(localStreamRef.current), peersRef.current.size)) {
          timeout = setTimeout(poll, getReconnectDelay(failures));
        }
      } finally {
        polling = false;
      }
    };

    const wakePoll = () => {
      if (stopped || polling) return;
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
      void poll();
    };
    pollWakeRef.current = wakePoll;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") wakePoll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      clearTimeout(resetState);
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollWakeRef.current === wakePoll) pollWakeRef.current = null;
      void send({ type: "presence:leave" }).catch(() => undefined).finally(() => transport.close?.(roomId));
      stopLocalCapture();
      closeAllPeers();
    };
  }, [closeAllPeers, handleSignal, initialOnline, makeRoomUnavailable, reconcileActiveStreams, resolveIceServers, roomId, send, stopLocalCapture, transport]);

  const startBroadcast = useCallback(async (stream: MediaStream, metadata: StreamMetadata, bitrate: number) => {
    localStreamRef.current = stream;
    bitrateRef.current = bitrate;
    for (const track of stream.getTracks()) {
      if (typeof track.addEventListener === "function") {
        track.addEventListener("ended", () => traceMedia("capture.track.ended", { kind: track.kind }), { once: true });
      }
    }
    await send({ type: "stream:start", metadata });
    traceMedia("broadcast.started", { audio: metadata.hasAudio });
    pollWakeRef.current?.();
    await Promise.all([...pendingWatchersRef.current].map(
      ([mediaSessionId, watcherUserId]) => offerBroadcastTo(watcherUserId, mediaSessionId),
    ));
  }, [offerBroadcastTo, send]);

  const replaceBroadcast = useCallback(async (stream: MediaStream, metadata: StreamMetadata, bitrate: number) => {
    const previousStream = localStreamRef.current;

    for (const session of peersRef.current.values()) {
      if (session.direction !== "outbound") continue;
      const needsNegotiation = await replacePeerTracks(session.peer, stream, bitrate);
      if (needsNegotiation && session.peer.signalingState === "stable") {
        await offerBroadcastTo(session.remoteUserId, session.id);
      }
    }

    localStreamRef.current = stream;
    bitrateRef.current = bitrate;
    await send({ type: "stream:start", metadata });
    previousStream?.getTracks().forEach((track) => track.stop());
  }, [offerBroadcastTo, send]);

  const stopBroadcast = useCallback(async () => {
    stopLocalCapture();
    closePeers((session) => session.direction === "outbound");
    pendingWatchersRef.current.clear();
    await send({ type: "stream:stop" }).catch(() => undefined);
    traceMedia("broadcast.stopped");
  }, [closePeers, send, stopLocalCapture]);

  const watch = useCallback(async (streamerUserId: string) => {
    setConnectionStatus("connecting");
    setConnectionError(null);
    const existingSessionId = inboundSessionByStreamerRef.current.get(streamerUserId);
    if (existingSessionId) {
      const existing = peersRef.current.get(existingSessionId)?.peer;
      if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") return;
      closePeer(existingSessionId);
    }
    const mediaSessionId = globalThis.crypto.randomUUID();
    const peer = await createPeer(mediaSessionId, streamerUserId, "inbound");
    if (!peer) {
      setConnectionStatus("unstable");
      setConnectionError("Não foi possível abrir outra transmissão deste usuário.");
      return;
    }
    const requestStream = async () => {
      const peer = peersRef.current.get(mediaSessionId)?.peer;
      if (!peer || peer.connectionState === "connected" || peer.connectionState === "closed") return;
      await send({ type: "watch:request", targetUserId: streamerUserId, mediaSessionId });
      pollWakeRef.current?.();
      const currentPeer = peersRef.current.get(mediaSessionId)?.peer;
      if (currentPeer !== peer || currentPeer.connectionState === "connected") return;
      const currentTimer = watchRetryTimersRef.current.get(mediaSessionId);
      if (currentTimer) clearTimeout(currentTimer);
      watchRetryTimersRef.current.set(mediaSessionId, setTimeout(() => {
        void requestStream().catch(() => setConnectionStatus("unstable"));
      }, WATCH_RETRY_INTERVAL_MS));
    };
    traceMedia("watch.started");
    await requestStream();
  }, [closePeer, createPeer, send]);

  const stopWatching = useCallback(async (streamerUserId: string) => {
    const mediaSessionId = inboundSessionByStreamerRef.current.get(streamerUserId);
    if (!mediaSessionId) return;
    closePeer(mediaSessionId);
    traceMedia("watch.stopped");
    await send({ type: "watch:stop", targetUserId: streamerUserId, mediaSessionId }).catch(() => undefined);
  }, [closePeer, send]);

  const dismissConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  return {
    activeStreams,
    connectionError,
    connectionStatus,
    dismissConnectionError,
    membershipRevision,
    onlineUserIds,
    remoteStreams,
    replaceBroadcast,
    roomUnavailable,
    startBroadcast,
    stopBroadcast,
    stopWatching,
    watch,
  };
}
