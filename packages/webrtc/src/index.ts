"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  | { type: "watch:request" | "watch:stop"; targetUserId: string }
  | { type: "webrtc:offer" | "webrtc:answer"; targetUserId: string; description: SessionDescription }
  | { type: "webrtc:ice-candidate"; targetUserId: string; candidate: IceCandidate };

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
};

export type RoomSignalDirective = {
  closeSender: boolean;
  membershipChanged: boolean;
  roomUnavailable: boolean;
};

export function getRoomSignalDirective(payload: ServerSignal): RoomSignalDirective {
  if (payload.type === "watch:stop" || payload.type === "stream:stop") {
    return { closeSender: true, membershipChanged: false, roomUnavailable: false };
  }
  if (payload.type === "room:closed" || payload.type === "room:revoked") {
    return { closeSender: false, membershipChanged: true, roomUnavailable: true };
  }
  return {
    closeSender: false,
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

type ConnectionStatus = "good" | "unstable" | "reconnecting";

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }];
const EMPTY_USER_IDS: string[] = [];
const PEER_CONNECTION_TIMEOUT_MS = 20_000;

export function getPeerConnectionStatus(states: RTCPeerConnectionState[]): ConnectionStatus {
  if (states.length === 0 || states.some((state) => state === "connected")) return "good";
  if (states.some((state) => state === "failed" || state === "disconnected")) return "unstable";
  return "reconnecting";
}

export function useRoomMediaCore({ roomId, transport, initialOnlineUserIds }: UseRoomMediaOptions) {
  const initialOnline = initialOnlineUserIds ?? EMPTY_USER_IDS;
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(initialOnline);
  const [activeStreams, setActiveStreams] = useState<ActiveStream[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("reconnecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [membershipRevision, setMembershipRevision] = useState(0);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const peerTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteStreamRefs = useRef(new Map<string, MediaStream>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const bitrateRef = useRef(10_000_000);
  const sinceRef = useRef(0);

  const send = useCallback(async (payload: ClientSignal) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    await transport.send(roomId, payload);
  }, [roomId, transport]);

  const closePeer = useCallback((remoteUserId: string) => {
    const timer = peerTimersRef.current.get(remoteUserId);
    if (timer) clearTimeout(timer);
    peerTimersRef.current.delete(remoteUserId);
    peersRef.current.get(remoteUserId)?.close();
    peersRef.current.delete(remoteUserId);
    pendingCandidatesRef.current.delete(remoteUserId);
    remoteStreamRefs.current.delete(remoteUserId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.close();
    for (const timer of peerTimersRef.current.values()) clearTimeout(timer);
    peersRef.current.clear();
    peerTimersRef.current.clear();
    pendingCandidatesRef.current.clear();
    remoteStreamRefs.current.clear();
    setRemoteStreams({});
  }, []);

  const stopLocalCapture = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const makeRoomUnavailable = useCallback(() => {
    stopLocalCapture();
    closeAllPeers();
    setActiveStreams([]);
    setOnlineUserIds([]);
    setRoomUnavailable(true);
  }, [closeAllPeers, stopLocalCapture]);

  const createPeer = useCallback(async (remoteUserId: string) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    const current = peersRef.current.get(remoteUserId);
    if (current && current.connectionState !== "closed") return current;

    const iceServers = await transport.getIceServers(roomId).catch(() => FALLBACK_ICE_SERVERS);
    const peer = new RTCPeerConnection({ iceServers });
    peersRef.current.set(remoteUserId, peer);
    peerTimersRef.current.set(remoteUserId, setTimeout(() => {
      if (peersRef.current.get(remoteUserId) !== peer || peer.connectionState === "connected") return;
      setConnectionStatus("unstable");
      setConnectionError("Não foi possível conectar a esta transmissão. Tente novamente.");
      closePeer(remoteUserId);
    }, PEER_CONNECTION_TIMEOUT_MS));
    peer.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const candidateInit = candidate.toJSON();
      void send({
        type: "webrtc:ice-candidate",
        targetUserId: remoteUserId,
        candidate: {
          candidate: candidateInit.candidate ?? "",
          sdpMid: candidateInit.sdpMid,
          sdpMLineIndex: candidateInit.sdpMLineIndex,
          usernameFragment: candidateInit.usernameFragment,
        },
      }).catch(() => setConnectionStatus("reconnecting"));
    };
    peer.ontrack = ({ track, streams }) => {
      const incomingStream = streams[0];
      const stream = remoteStreamRefs.current.get(remoteUserId) ?? incomingStream ?? new MediaStream();
      remoteStreamRefs.current.set(remoteUserId, stream);
      if (!stream.getTracks().some((currentTrack) => currentTrack.id === track.id)) stream.addTrack(track);
      if (track.kind !== "video") return;
      const publishStream = () => {
        if (peersRef.current.get(remoteUserId) !== peer) return;
        setRemoteStreams((currentStreams) => ({ ...currentStreams, [remoteUserId]: stream }));
      };
      if (track.muted) track.addEventListener("unmute", publishStream, { once: true });
      else publishStream();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        const timer = peerTimersRef.current.get(remoteUserId);
        if (timer) clearTimeout(timer);
        peerTimersRef.current.delete(remoteUserId);
        setConnectionStatus("good");
        setConnectionError(null);
      } else if (peer.connectionState === "new" || peer.connectionState === "connecting") {
        setConnectionStatus("reconnecting");
      } else if (peer.connectionState === "disconnected") {
        setConnectionStatus("unstable");
      } else if (peer.connectionState === "failed") {
        setConnectionStatus("unstable");
        setConnectionError("Não foi possível conectar a esta transmissão.");
        closePeer(remoteUserId);
      }
    };
    return peer;
  }, [closePeer, roomId, send, transport]);

  const handleSignal = useCallback(async (senderUserId: string, payload: ServerSignal) => {
    const directive = getRoomSignalDirective(payload);
    if (directive.membershipChanged) setMembershipRevision((value) => value + 1);
    if (directive.roomUnavailable) {
      makeRoomUnavailable();
      return true;
    }
    if (directive.closeSender) {
      closePeer(senderUserId);
      return false;
    }

    const applyPendingCandidates = async (peer: RTCPeerConnection) => {
      const candidates = pendingCandidatesRef.current.get(senderUserId) ?? [];
      pendingCandidatesRef.current.delete(senderUserId);
      for (const candidate of candidates) await peer.addIceCandidate(candidate);
    };

    if (payload.type === "watch:request" && localStreamRef.current) {
      const peer = await createPeer(senderUserId);
      if (peer.getSenders().length === 0) {
        for (const track of localStreamRef.current.getTracks()) {
          const sender = peer.addTrack(track, localStreamRef.current);
          if (track.kind === "video") {
            const parameters = sender.getParameters();
            parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
            const [encoding] = parameters.encodings;
            if (encoding) encoding.maxBitrate = bitrateRef.current;
            await sender.setParameters(parameters).catch(() => undefined);
          }
        }
      }
      const description = await peer.createOffer();
      await peer.setLocalDescription(description);
      await send({
        type: "webrtc:offer",
        targetUserId: senderUserId,
        description: { type: "offer", sdp: description.sdp ?? "" },
      });
    } else if (payload.type === "webrtc:offer") {
      const peer = await createPeer(senderUserId);
      await peer.setRemoteDescription(payload.description);
      await applyPendingCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await send({
        type: "webrtc:answer",
        targetUserId: senderUserId,
        description: { type: "answer", sdp: answer.sdp ?? "" },
      });
    } else if (payload.type === "webrtc:answer") {
      const peer = peersRef.current.get(senderUserId);
      if (peer) {
        await peer.setRemoteDescription(payload.description);
        await applyPendingCandidates(peer);
      }
    } else if (payload.type === "webrtc:ice-candidate") {
      const peer = peersRef.current.get(senderUserId) ?? await createPeer(senderUserId);
      if (peer.remoteDescription) await peer.addIceCandidate(payload.candidate);
      else pendingCandidatesRef.current.set(senderUserId, [
        ...(pendingCandidatesRef.current.get(senderUserId) ?? []),
        payload.candidate,
      ]);
    }
    return false;
  }, [closePeer, createPeer, makeRoomUnavailable, send]);

  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    sinceRef.current = 0;
    const resetState = setTimeout(() => {
      setRoomUnavailable(false);
      setConnectionError(null);
      setConnectionStatus("reconnecting");
      setOnlineUserIds(initialOnline);
      setActiveStreams([]);
      setRemoteStreams({});
      void send({ type: "presence:join" }).catch(() => undefined);
      void poll();
    }, 0);

    const poll = async () => {
      if (stopped) return;
      try {
        const data = await transport.poll(roomId, sinceRef.current);
        failures = 0;
        setConnectionStatus(getPeerConnectionStatus([...peersRef.current.values()].map((peer) => peer.connectionState)));
        setOnlineUserIds(data.onlineUserIds);
        setActiveStreams(data.activeStreams);
        for (const event of data.events) {
          if (await handleSignal(event.senderUserId, event.payload)) return;
        }
        sinceRef.current = Math.max(sinceRef.current, data.cursor);
        timeout = setTimeout(poll, 1_500);
      } catch (error) {
        failures += 1;
        setConnectionStatus("reconnecting");
        if (transport.isRoomUnavailable(error)) {
          makeRoomUnavailable();
          return;
        }
        timeout = setTimeout(poll, getReconnectDelay(failures));
      }
    };

    return () => {
      stopped = true;
      clearTimeout(resetState);
      if (timeout) clearTimeout(timeout);
      void send({ type: "presence:leave" }).catch(() => undefined);
      stopLocalCapture();
      closeAllPeers();
    };
  }, [closeAllPeers, handleSignal, initialOnline, makeRoomUnavailable, roomId, send, stopLocalCapture, transport]);

  const startBroadcast = useCallback(async (stream: MediaStream, metadata: StreamMetadata, bitrate: number) => {
    localStreamRef.current = stream;
    bitrateRef.current = bitrate;
    await send({ type: "stream:start", metadata });
  }, [send]);

  const stopBroadcast = useCallback(async () => {
    stopLocalCapture();
    closeAllPeers();
    await send({ type: "stream:stop" }).catch(() => undefined);
  }, [closeAllPeers, send, stopLocalCapture]);

  const watch = useCallback(async (streamerUserId: string) => {
    setConnectionStatus("reconnecting");
    setConnectionError(null);
    await createPeer(streamerUserId);
    await send({ type: "watch:request", targetUserId: streamerUserId });
  }, [createPeer, send]);

  const stopWatching = useCallback(async (streamerUserId: string) => {
    closePeer(streamerUserId);
    await send({ type: "watch:stop", targetUserId: streamerUserId }).catch(() => undefined);
  }, [closePeer, send]);

  return {
    activeStreams,
    connectionError,
    connectionStatus,
    membershipRevision,
    onlineUserIds,
    remoteStreams,
    roomUnavailable,
    startBroadcast,
    stopBroadcast,
    stopWatching,
    watch,
  };
}
