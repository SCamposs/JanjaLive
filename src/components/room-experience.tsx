"use client";

import { TooltipButton } from "@janjalive/ui";

import {
  Check,
  Copy,
  DoorOpen,
  MonitorUp,
  Play,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { playRoomCue } from "@janjalive/webrtc";
import { getWebDisplayCaptureOptions, prepareDisplayCapture } from "@/lib/display-capture";
import type { RoomSnapshot } from "@/lib/rooms";
import { getCaptureConstraints, QUALITY_PROFILES } from "@/lib/quality";
import { AccountMenu } from "./account-menu";
import { AdminShortcut } from "./admin-shortcut";
import { Brand } from "./brand";
import { NoirInterference } from "./noir-interference";
import { ScreenShareDialog, type ScreenShareOptions } from "./screen-share-dialog";
import { StreamPlayer } from "./stream-player";
import { Toast } from "./toast";
import { UserAvatar } from "./user-avatar";
import { useRoomMedia } from "@/hooks/use-room-media";

type Props = {
  snapshot: RoomSnapshot;
  currentUser: { id: string; name?: string | null; image?: string | null };
  isAdmin?: boolean;
};

export function RoomExperience({ snapshot, currentUser, isAdmin = false }: Props) {
  const router = useRouter();
  const realtime = useRoomMedia(snapshot.room.id, currentUser.id);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]);
  const selectedStreamer = selectedStreamers.at(-1) ?? null;
  const [copied, setCopied] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureFallbackAvailable, setCaptureFallbackAvailable] = useState(false);
  const [dismissedConnectionError, setDismissedConnectionError] = useState<string | null>(null);
  const canShare = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    getDisplayCaptureSupport,
    getServerDisplayCaptureSupport,
  );

  useEffect(() => {
    router.refresh();
  }, [realtime.membershipRevision, realtime.onlineUserIds, router]);

  useEffect(() => {
    if (realtime.roomUnavailable) router.replace("/");
  }, [realtime.roomUnavailable, router]);

  const membersById = useMemo(
    () => new Map(snapshot.members.map((member) => [member.userId, member])),
    [snapshot.members],
  );
  const onlineUserIds = useMemo(() => new Set(realtime.onlineUserIds), [realtime.onlineUserIds]);
  const streamingUserIds = useMemo(
    () => new Set(realtime.activeStreams.map((stream) => stream.streamerUserId)),
    [realtime.activeStreams],
  );
  const remoteActiveStreams = useMemo(
    () => realtime.activeStreams.filter((stream) => stream.streamerUserId !== currentUser.id),
    [currentUser.id, realtime.activeStreams],
  );
  const isWatchingOwnStream = selectedStreamer === currentUser.id && Boolean(localStream);
  const connectionError = realtime.connectionError === dismissedConnectionError ? null : realtime.connectionError;
  const stopWatching = realtime.stopWatching;
  const knownStreamsRef = useRef<Set<string> | null>(null);
  const fallbackShareOptionsRef = useRef<ScreenShareOptions | null>(null);
  const captureRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => { captureRequestRef.current?.abort(); }, [snapshot.room.id]);

  function cancelCapture() {
    captureRequestRef.current?.abort();
    setShareDialogOpen(false);
  }

  useEffect(() => {
    const current = new Set(remoteActiveStreams.map((stream) => stream.streamerUserId));
    const known = knownStreamsRef.current;
    if (known && remoteActiveStreams.some((stream) => !known.has(stream.streamerUserId))) {
      void playRoomCue("stream-start");
    }
    knownStreamsRef.current = current;
  }, [remoteActiveStreams]);

  useEffect(() => {
    const ended = selectedStreamers.filter((id) => id !== currentUser.id && !streamingUserIds.has(id));
    if (!ended.length) return;
    const timeout = window.setTimeout(() => {
      ended.forEach((id) => { void stopWatching(id); });
      setSelectedStreamers((ids) => ids.filter((id) => !ended.includes(id)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentUser.id, selectedStreamers, stopWatching, streamingUserIds]);

  async function stopSharing() {
    localStream?.getVideoTracks().forEach((track) => { track.onended = null; });
    await realtime.stopBroadcast();
    setLocalStream(null);
    setIsBroadcasting(false);
    setSelectedStreamers((ids) => ids.filter((id) => id !== currentUser.id));
  }

  async function watchStreamer(userId: string) {
    if (selectedStreamers.includes(userId)) return;
    setSelectedStreamers((ids) => ids.includes(userId) ? ids : [...ids, userId]);
    await playRoomCue("join", true);
    await realtime.watch(userId);
  }

  async function leaveStream(userId: string) {
    await realtime.stopWatching(userId);
    setSelectedStreamers((ids) => ids.filter((id) => id !== userId));
    await playRoomCue("leave", true);
  }

  function beginCapture() {
    setCaptureError(null);
    setCaptureFallbackAvailable(false);
    if (!canShare) {
      setCaptureError("Este navegador pode assistir, mas não oferece compartilhamento de tela.");
      return;
    }
    setShareDialogOpen(true);
  }

  async function startSharing(options: ScreenShareOptions, includeSystemAudio = true) {
    captureRequestRef.current?.abort();
    const request = new AbortController();
    captureRequestRef.current = request;
    setCaptureError(null);
    setCaptureFallbackAvailable(false);
    fallbackShareOptionsRef.current = options;
    let stream: MediaStream | null = null;
    try {
      const constraints = getCaptureConstraints(options.preset);
      if (options.preset === "source") constraints.frameRate = { ideal: options.frameRate, max: options.frameRate };
      const selectedStream = await prepareDisplayCapture(getWebDisplayCaptureOptions(includeSystemAudio), constraints, request.signal);
      stream = selectedStream;
      request.signal.throwIfAborted();
      const [videoTrack] = selectedStream.getVideoTracks();
      videoTrack.onended = () => {
        void realtime.stopBroadcast();
        setLocalStream(null);
        setIsBroadcasting(false);
        setSelectedStreamers((ids) => ids.filter((id) => id !== currentUser.id));
      };
      const settings = videoTrack.getSettings();
      const metadata = {
        preset: options.preset,
        width: settings.width ?? QUALITY_PROFILES[options.preset].width ?? 1920,
        height: settings.height ?? QUALITY_PROFILES[options.preset].height ?? 1080,
        frameRate: settings.frameRate ?? options.frameRate,
        hasAudio: selectedStream.getAudioTracks().length > 0,
      };
      const previousStream = localStream;
      // Selection is complete. Close its cancellation UI before committing media.
      setShareDialogOpen(false);
      if (isBroadcasting) await realtime.replaceBroadcast(selectedStream, metadata, options.bitrate);
      else {
        await realtime.startBroadcast(selectedStream, metadata, options.bitrate);
        await playRoomCue("stream-start", true);
      }
      request.signal.throwIfAborted();
      setLocalStream(selectedStream);
      setIsBroadcasting(true);
      setSelectedStreamers((ids) => ids.includes(currentUser.id) ? ids : [...ids, currentUser.id]);
      setShareDialogOpen(false);
      fallbackShareOptionsRef.current = null;
      if (previousStream && previousStream !== selectedStream) {
        previousStream.getVideoTracks().forEach((track) => { track.onended = null; });
        previousStream.getTracks().forEach((track) => track.stop());
      }
      return true;
    } catch (error) {
      stream?.getVideoTracks().forEach((track) => { track.onended = null; });
      stream?.getTracks().forEach((track) => track.stop());
      if (error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name)) return false;
      if (includeSystemAudio && error instanceof DOMException && error.name === "NotReadableError") {
        setCaptureError("Não foi possível iniciar o áudio desta fonte.");
        setCaptureFallbackAvailable(true);
        return false;
      }
      setCaptureError(
        error instanceof DOMException && error.name === "NotReadableError"
          ? "O navegador não conseguiu capturar essa fonte."
          : stream
            ? "Não foi possível começar a transmissão. Tente novamente."
            : "Não foi possível iniciar a captura de tela.",
      );
      return false;
    } finally {
      if (captureRequestRef.current === request) captureRequestRef.current = null;
    }
  }

  async function handleMember(userId: string, action: "approve" | "reject" | "revoke") {
    const response = await fetch(`/api/rooms/${snapshot.room.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    if (!response.ok) {
      setCaptureError(response.status === 409 ? "A sala atingiu o limite de membros." : "Não foi possível alterar o acesso. Tente novamente.");
      return;
    }
    router.refresh();
  }

  async function copyInvite() {
    try {
      const response = await fetch(`/api/rooms/${snapshot.room.id}/invite`, { cache: "no-store" });
      if (!response.ok) throw new Error("INVITE_UNAVAILABLE");
      const data = await response.json() as { invitePath: string };
      await navigator.clipboard.writeText(new URL(data.invitePath, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCaptureError("Não foi possível copiar o convite. Tente novamente.");
    }
  }

  async function regenerateInvite() {
    const response = await fetch(`/api/rooms/${snapshot.room.id}/invite`, { method: "POST" });
    if (!response.ok) return;
    const data = (await response.json()) as { invitePath: string };
    const nextUrl = new URL(data.invitePath, window.location.origin).toString();
    await navigator.clipboard.writeText(nextUrl);
    router.replace(data.invitePath);
  }

  async function closeRoom() {
    if (isBroadcasting) await stopSharing();
    await fetch(`/api/rooms/${snapshot.room.id}/close`, { method: "POST" });
    router.push("/");
  }

  async function leaveRoom() {
    if (isBroadcasting) await stopSharing();
    await Promise.all(selectedStreamers.filter((id) => id !== currentUser.id).map(realtime.stopWatching));
    router.push("/");
  }

  return (
    <main className="room-page">
      <header className="app-header">
        <div className="header-left">
          <Brand compact />
          <span className="header-divider" />
          <div className="room-identity">
            <strong>{snapshot.room.name}</strong>
            {realtime.connectionStatus !== "good" && (
              <><span className={`connection-dot ${realtime.connectionStatus}`} /><small>{realtime.connectionStatus === "unstable" ? "Instável" : realtime.connectionStatus === "connecting" ? "Conectando" : "Reconectando"}</small></>
            )}
          </div>
        </div>
        <div className="header-actions">
          {isAdmin && <AdminShortcut />}
          <button className="button secondary compact" type="button" onClick={copyInvite}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiado" : "Convidar"}
          </button>
          {snapshot.room.isOwner && (
            <details className="settings-menu">
              <summary className="icon-button" aria-label="Configurações"><Settings size={18} /></summary>
              <div className="settings-popover">
                <strong>Configurações da sala</strong>
                <span>{snapshot.room.accessMode === "APPROVAL" ? "Entrada com aprovação" : "Entrada pelo convite"}</span>
                <button type="button" onClick={regenerateInvite}>Gerar novo convite</button>
                <button type="button" className="danger-text" onClick={closeRoom}>Fechar sala</button>
              </div>
            </details>
          )}
          <button className="button secondary compact room-leave-button" type="button" onClick={() => void leaveRoom()} aria-label="Sair da sala">
            <DoorOpen size={16} /> <span>Sair da sala</span>
          </button>
          <AccountMenu
            compact
            image={currentUser.image}
            name={currentUser.name ?? "Conta Discord"}
            signOutDisabled={isBroadcasting}
          />
        </div>
      </header>

      <div className="room-grid">
        <section className="media-column">
          {(isBroadcasting || (!isBroadcasting && selectedStreamer)) && (
            <div className="media-toolbar">
              {isBroadcasting ? (
                <>
                  <span className="broadcast-audience">Sua transmissão está ao vivo</span>
                  <button className="button secondary compact" type="button" onClick={() => setSelectedStreamers((ids) => ids.includes(currentUser.id) ? ids : [...ids, currentUser.id])} disabled={isWatchingOwnStream}>Minha transmissão</button>
                  <button className="button secondary compact" type="button" onClick={() => void beginCapture()} disabled={!canShare}><MonitorUp size={16} /> Trocar tela</button>
                  <button className="button ghost compact danger-text" type="button" onClick={() => void stopSharing()}>Encerrar</button>
                </>
              ) : (
              <button className="button primary compact" type="button" onClick={() => void beginCapture()} disabled={!canShare}>
                <MonitorUp size={16} /> Compartilhar
              </button>
              )}
            </div>
          )}

          <section className="stage">
            {selectedStreamers.length > 0 ? <div className="multilive-grid" data-multiple={selectedStreamers.length > 1}>
              {selectedStreamers.map((id, index) => {
                const own = id === currentUser.id;
                const stream = own ? localStream : realtime.remoteStreams[id];
                return <div className="multilive-tile" key={id}>{stream ? <StreamPlayer stream={stream} streamerName={own ? "Sua transmissão" : membersById.get(id)?.name ?? "Amigo"} status={realtime.connectionStatus} mode={own ? "local" : "remote"} viewerNames={own ? realtime.viewerUserIds.map((viewerId) => membersById.get(viewerId)?.name ?? "Membro") : undefined} initiallyMuted={own || index > 0} onStop={() => void (own ? stopSharing() : leaveStream(id))} /> : <div className="stream-connecting" role="status"><span>Conectando a {membersById.get(id)?.name ?? "transmissão"}…</span><button className="button secondary compact" type="button" onClick={() => void leaveStream(id)}>Cancelar</button></div>}</div>;
              })}
            </div> : remoteActiveStreams.length > 0 ? (
              <div className="stream-picker">
                <div className="stream-picker-heading">
                  <div><h1>Transmissões</h1><p>Escolha uma tela para assistir.</p></div>
                  {!isBroadcasting && canShare && (
                    <button type="button" className="button secondary compact" onClick={() => void beginCapture()}><MonitorUp size={16} /> Compartilhar</button>
                  )}
                </div>
                <div className="stream-choices">
                  {remoteActiveStreams.map((stream) => {
                    const member = membersById.get(stream.streamerUserId);
                    const name = member?.name ?? "Amigo";
                    return (
                      <button
                        className="stream-choice"
                        type="button"
                        key={stream.streamerUserId}
                        onClick={() => void watchStreamer(stream.streamerUserId)}
                      >
                        <UserAvatar className="stream-choice-avatar" image={member?.image} name={name} size={48} />
                        <span className="stream-choice-copy"><strong>{name}</strong><span><b>AO VIVO</b> {QUALITY_PROFILES[stream.preset].label}{stream.hasAudio ? " · Áudio" : ""}</span></span>
                        <span className="stream-choice-action"><Play size={14} fill="currentColor" /> Assistir</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <NoirInterference className="empty-stage-noir">
                <div className="empty-stage">
                  <h1>Nenhuma transmissão ativa</h1>
                  <p>Compartilhe sua tela ou aguarde um amigo começar.</p>
                  {!isBroadcasting && canShare && <button type="button" className="button primary" onClick={() => void beginCapture()}><MonitorUp size={17} /> Compartilhar minha tela</button>}
                </div>
              </NoirInterference>
            )}
          </section>
        </section>

        <aside className="members-panel">
          <div className="panel-title"><div><UsersRound size={18} /><h2>Membros</h2><span>{snapshot.members.length}</span></div></div>
          {snapshot.pending.length > 0 && (
            <section className="member-section pending-section">
              <h3>Solicitações</h3>
              {snapshot.pending.map((person) => (
                <div className="pending-card" key={person.userId}>
                  <MemberAvatar person={person} />
                  <strong>{person.name}</strong><span>quer entrar</span>
                  <div><button type="button" onClick={() => handleMember(person.userId, "approve")}>Aprovar</button><button type="button" onClick={() => handleMember(person.userId, "reject")}>Recusar</button></div>
                </div>
              ))}
            </section>
          )}
          <section className="member-section">
            <h3>Online <span>{snapshot.members.filter((member) => onlineUserIds.has(member.userId)).length}</span></h3>
            {snapshot.members.filter((member) => onlineUserIds.has(member.userId)).map((person) => (
              <MemberRow key={person.userId} person={person} online streaming={streamingUserIds.has(person.userId)} selected={selectedStreamers.includes(person.userId)} isCurrentUser={person.userId === currentUser.id} isOwner={snapshot.room.isOwner} onWatch={watchStreamer} onRevoke={handleMember} />
            ))}
          </section>
          <section className="member-section">
            <h3>Autorizados <span>{snapshot.members.length}</span></h3>
            {snapshot.members.map((person) => (
              <MemberRow
                key={person.userId}
                person={person}
                online={onlineUserIds.has(person.userId)}
                streaming={streamingUserIds.has(person.userId)}
                selected={selectedStreamers.includes(person.userId)}
                isCurrentUser={person.userId === currentUser.id}
                isOwner={snapshot.room.isOwner}
                onWatch={watchStreamer}
                onRevoke={handleMember}
              />
            ))}
          </section>
          <div className="room-code"><span>Código da sala</span><strong>{snapshot.room.code}</strong></div>
        </aside>
      </div>

      <ScreenShareDialog
        open={shareDialogOpen}
        onCancel={cancelCapture}
        onStart={startSharing}
      />
      {(captureError || connectionError) && (
        <Toast
          message={captureError || connectionError || "Não foi possível conectar."}
          onDismiss={() => {
            if (captureError) {
              setCaptureError(null);
              setCaptureFallbackAvailable(false);
            } else if (connectionError) {
              setDismissedConnectionError(connectionError);
            }
          }}
          action={captureFallbackAvailable ? {
            label: "Tentar sem áudio",
            onClick: () => {
              const options = fallbackShareOptionsRef.current;
              if (options) void startSharing(options, false);
            },
          } : undefined}
        />
      )}
    </main>
  );
}

function subscribeToBrowserCapabilities() {
  return () => undefined;
}

function getDisplayCaptureSupport() {
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}

function getServerDisplayCaptureSupport() {
  return false;
}

function MemberAvatar({ person }: { person: { name: string; image: string | null } }) {
  return <UserAvatar image={person.image} name={person.name} size={31} className="member-avatar" />;
}

function MemberRow({ person, online, streaming, selected, isCurrentUser, isOwner, onWatch, onRevoke }: {
  person: RoomSnapshot["members"][number];
  online: boolean;
  streaming: boolean;
  selected: boolean;
  isCurrentUser: boolean;
  isOwner: boolean;
  onWatch: (userId: string) => Promise<void>;
  onRevoke: (userId: string, action: "approve" | "reject" | "revoke") => Promise<void>;
}) {
  return (
    <div className="member-row">
      <div className="avatar-wrap"><MemberAvatar person={person} /><span data-online={online} /></div>
      <div><strong>{person.name}</strong><span>{streaming ? `${person.role === "OWNER" ? "Dono · " : ""}Transmitindo` : person.role === "OWNER" ? "Dono" : online ? "Online" : "Offline"}</span></div>
      <div className="member-actions">
        {streaming && !isCurrentUser && <TooltipButton className="member-watch" tooltip={selected ? `Assistindo ${person.name}` : `Assistir ${person.name}`} type="button" disabled={selected} onClick={() => void onWatch(person.userId)} aria-label={selected ? `Assistindo ${person.name}` : `Assistir ${person.name}`}><Play size={13} fill="currentColor" /></TooltipButton>}
        {isOwner && person.role !== "OWNER" && <button className="member-menu" type="button" onClick={() => onRevoke(person.userId, "revoke")} aria-label={`Remover ${person.name}`}><X size={15} /></button>}
      </div>
    </div>
  );
}
