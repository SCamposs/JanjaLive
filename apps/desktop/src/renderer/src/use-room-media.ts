import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientSignal, RealtimePoll, ServerSignal } from "../../shared/contracts";

type StreamMetadata = RealtimePoll["activeStreams"][number];
type ConnectionStatus = "good" | "unstable" | "reconnecting";

export function useRoomMedia(roomId: string | null) {
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [activeStreams, setActiveStreams] = useState<StreamMetadata[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("reconnecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [membershipRevision, setMembershipRevision] = useState(0);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const bitrateRef = useRef(10_000_000);
  const sinceRef = useRef(0);

  const send = useCallback(async (payload: ClientSignal) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    await window.janja.realtime.send(roomId, payload);
  }, [roomId]);

  const closePeer = useCallback((remoteUserId: string) => {
    peersRef.current.get(remoteUserId)?.close();
    peersRef.current.delete(remoteUserId);
    pendingCandidatesRef.current.delete(remoteUserId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
  }, []);

  const createPeer = useCallback(async (remoteUserId: string) => {
    if (!roomId) throw new Error("ROOM_REQUIRED");
    const current = peersRef.current.get(remoteUserId);
    if (current && current.connectionState !== "closed") return current;
    const iceServers = await window.janja.realtime.getIceServers(roomId).catch(() => [
      { urls: "stun:stun.cloudflare.com:3478" },
    ]);
    const peer = new RTCPeerConnection({ iceServers });
    peersRef.current.set(remoteUserId, peer);
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
    peer.ontrack = ({ streams }) => {
      const [stream] = streams;
      if (stream) setRemoteStreams((currentStreams) => ({ ...currentStreams, [remoteUserId]: stream }));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setConnectionStatus("good");
        setConnectionError(null);
      } else if (peer.connectionState === "disconnected") {
        setConnectionStatus("unstable");
      } else if (peer.connectionState === "failed") {
        setConnectionStatus("unstable");
        setConnectionError("Não foi possível conectar a esta transmissão.");
        closePeer(remoteUserId);
      }
    };
    return peer;
  }, [closePeer, roomId, send]);

  const handleSignal = useCallback(async (senderUserId: string, payload: ServerSignal) => {
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
    } else if (payload.type === "watch:stop" || payload.type === "stream:stop") {
      closePeer(senderUserId);
    } else if (payload.type.startsWith("room:")) {
      setMembershipRevision((value) => value + 1);
      if (payload.type === "room:closed" || payload.type === "room:revoked") setRoomUnavailable(true);
    }
  }, [closePeer, createPeer, send]);

  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    sinceRef.current = 0;
    const resetUnavailable = setTimeout(() => setRoomUnavailable(false), 0);

    const poll = async () => {
      if (stopped) return;
      try {
        const data = await window.janja.realtime.poll(roomId, sinceRef.current);
        failures = 0;
        setConnectionStatus((current) => current === "unstable" ? current : "good");
        setOnlineUserIds(data.onlineUserIds);
        setActiveStreams(data.activeStreams);
        for (const event of data.events) await handleSignal(event.senderUserId, event.payload);
        sinceRef.current = Math.max(sinceRef.current, data.cursor);
        timeout = setTimeout(poll, 1_500);
      } catch (error) {
        failures += 1;
        setConnectionStatus("reconnecting");
        if (String(error).includes("API_403") || String(error).includes("API_404")) {
          setRoomUnavailable(true);
          return;
        }
        timeout = setTimeout(poll, Math.min(12_000, 1_000 * 2 ** failures));
      }
    };

    void send({ type: "presence:join" }).catch(() => undefined);
    void poll();
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    return () => {
      stopped = true;
      clearTimeout(resetUnavailable);
      if (timeout) clearTimeout(timeout);
      void send({ type: "presence:leave" }).catch(() => undefined);
      peers.forEach((peer) => peer.close());
      peers.clear();
      pendingCandidates.clear();
      localStreamRef.current = null;
      setRemoteStreams({});
      setActiveStreams([]);
    };
  }, [handleSignal, roomId, send]);

  const startBroadcast = useCallback(async (
    stream: MediaStream,
    metadata: Omit<StreamMetadata, "streamerUserId" | "startedAt">,
    bitrate: number,
  ) => {
    localStreamRef.current = stream;
    bitrateRef.current = bitrate;
    await send({ type: "stream:start", metadata });
  }, [send]);

  const stopBroadcast = useCallback(async () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peersRef.current.forEach((_, remoteUserId) => closePeer(remoteUserId));
    await send({ type: "stream:stop" }).catch(() => undefined);
  }, [closePeer, send]);

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
