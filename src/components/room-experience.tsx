"use client";

import {
  Check,
  Copy,
  MonitorUp,
  Radio,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { RoomSnapshot } from "@/lib/rooms";
import { QUALITY_PROFILES } from "@/lib/quality";
import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { ScreenShareDialog } from "./screen-share-dialog";
import { StreamPlayer } from "./stream-player";
import { useRoomMedia } from "@/hooks/use-room-media";

type Props = {
  snapshot: RoomSnapshot;
  currentUser: { id: string; name?: string | null; image?: string | null };
};

export function RoomExperience({ snapshot, currentUser }: Props) {
  const router = useRouter();
  const realtime = useRoomMedia(snapshot.room.id, currentUser.id);
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [selectedStreamer, setSelectedStreamer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const canShare = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    getDisplayCaptureSupport,
    getServerDisplayCaptureSupport,
  );

  useEffect(() => {
    if (realtime.membershipRevision > 0) router.refresh();
  }, [realtime.membershipRevision, router]);

  const membersById = useMemo(
    () => new Map(snapshot.members.map((member) => [member.userId, member])),
    [snapshot.members],
  );
  const isWatchingOwnStream = selectedStreamer === currentUser.id && Boolean(localStream);
  const selectedStream = selectedStreamer && !isWatchingOwnStream ? realtime.remoteStreams[selectedStreamer] : undefined;

  async function stopSharing() {
    localStream?.getVideoTracks().forEach((track) => { track.onended = null; });
    await realtime.stopBroadcast();
    setLocalStream(null);
    setIsBroadcasting(false);
    setSelectedStreamer((selected) => selected === currentUser.id ? null : selected);
  }

  async function beginCapture() {
    setCaptureError(null);
    if (!canShare) {
      setCaptureError("Este navegador pode assistir, mas não oferece compartilhamento de tela.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window" },
        audio: true,
      });
      const [videoTrack] = stream.getVideoTracks();
      videoTrack.onended = () => {
        void realtime.stopBroadcast();
        setCapture(null);
        setLocalStream(null);
        setIsBroadcasting(false);
        setSelectedStreamer((selected) => selected === currentUser.id ? null : selected);
      };
      setCapture(stream);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setCaptureError("Não foi possível abrir o seletor de tela.");
    }
  }

  function cancelCapture() {
    capture?.getVideoTracks().forEach((track) => { track.onended = null; });
    capture?.getTracks().forEach((track) => track.stop());
    setCapture(null);
  }

  async function handleMember(userId: string, action: "approve" | "reject" | "revoke") {
    await fetch(`/api/rooms/${snapshot.room.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    router.refresh();
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
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
    if (capture) cancelCapture();
    if (isBroadcasting) await stopSharing();
    if (selectedStreamer && selectedStreamer !== currentUser.id) {
      await realtime.stopWatching(selectedStreamer);
    }
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
              <><span className={`connection-dot ${realtime.connectionStatus}`} /><small>{realtime.connectionStatus === "unstable" ? "Instável" : "Reconectando"}</small></>
            )}
          </div>
        </div>
        <div className="header-actions">
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
          <AccountMenu
            compact
            image={currentUser.image}
            name={currentUser.name ?? "Conta Discord"}
            signOutDisabled={isBroadcasting || Boolean(capture)}
            onLeaveRoom={leaveRoom}
          />
        </div>
      </header>

      <div className="room-grid">
        <section className="media-column">
          <div className="stream-bar">
            <div className="stream-list">
              {realtime.activeStreams.map((stream) => {
                const member = membersById.get(stream.streamerUserId);
                const isWatching = selectedStreamer === stream.streamerUserId;
                return (
                  <article className="stream-card" key={stream.streamerUserId}>
                    <span className="live-avatar"><Radio size={15} /></span>
                    <div className="stream-details"><strong>{member?.name ?? "Amigo"}</strong><span><b>LIVE</b> {QUALITY_PROFILES[stream.preset].label} {stream.hasAudio ? "· Áudio" : ""}</span></div>
                    <button type="button" onClick={() => {
                      setSelectedStreamer(stream.streamerUserId);
                      void realtime.watch(stream.streamerUserId);
                    }} disabled={isWatching}>{isWatching ? "Assistindo" : "Assistir"}</button>
                  </article>
                );
              })}
              {isBroadcasting && (
                <article className="stream-card own-stream">
                  <span className="live-avatar"><MonitorUp size={15} /></span>
                  <div className="stream-details"><strong>Você</strong><span><b>LIVE</b> Compartilhando</span></div>
                  <div className="stream-card-actions">
                    <button type="button" disabled={isWatchingOwnStream} onClick={() => setSelectedStreamer(currentUser.id)}>{isWatchingOwnStream ? "Vendo" : "Ver"}</button>
                    <button type="button" className="danger-text" onClick={() => void stopSharing()}>Encerrar</button>
                  </div>
                </article>
              )}
            </div>
            {!isBroadcasting && selectedStreamer && (
              <button className="button primary compact" type="button" onClick={beginCapture} disabled={!canShare}>
                <MonitorUp size={16} /> Compartilhar
              </button>
            )}
          </div>

          <section className="stage">
            {isWatchingOwnStream && localStream ? (
              <StreamPlayer
                stream={localStream}
                streamerName="Sua transmissão"
                status={realtime.connectionStatus}
                mode="local"
                onStop={() => void stopSharing()}
              />
            ) : selectedStream && selectedStreamer ? (
              <StreamPlayer
                stream={selectedStream}
                streamerName={membersById.get(selectedStreamer)?.name ?? "Amigo"}
                status={realtime.connectionStatus}
                onStop={() => {
                  void realtime.stopWatching(selectedStreamer);
                  setSelectedStreamer(null);
                }}
              />
            ) : (
              <div className="empty-stage">
                <span className="empty-stage-icon"><MonitorUp size={28} /></span>
                <h1>{realtime.activeStreams.length ? "Escolha uma transmissão" : "Nenhuma transmissão ativa"}</h1>
                <p>{realtime.activeStreams.length ? "Você só recebe a tela que decidir assistir." : "Compartilhe sua tela ou aguarde um amigo começar."}</p>
                {!isBroadcasting && canShare && <button type="button" className="button primary" onClick={beginCapture}><MonitorUp size={17} /> Compartilhar minha tela</button>}
              </div>
            )}
          </section>
          {(captureError || realtime.connectionError) && <p className="inline-alert" role="alert">{captureError || realtime.connectionError}</p>}
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
            <h3>Online <span>{snapshot.members.filter((member) => realtime.onlineUserIds.includes(member.userId)).length}</span></h3>
            {snapshot.members.filter((member) => realtime.onlineUserIds.includes(member.userId)).map((person) => (
              <MemberRow key={person.userId} person={person} online isOwner={snapshot.room.isOwner} onRevoke={handleMember} />
            ))}
          </section>
          <section className="member-section">
            <h3>Autorizados <span>{snapshot.members.length}</span></h3>
            {snapshot.members.map((person) => (
              <MemberRow
                key={person.userId}
                person={person}
                online={realtime.onlineUserIds.includes(person.userId)}
                isOwner={snapshot.room.isOwner}
                onRevoke={handleMember}
              />
            ))}
          </section>
          <div className="room-code"><span>Código da sala</span><strong>{snapshot.room.code}</strong></div>
        </aside>
      </div>

      <ScreenShareDialog
        stream={capture}
        onCancel={cancelCapture}
        onStart={async ({ stream, preset, bitrate, frameRate }) => {
          const settings = stream.getVideoTracks()[0]?.getSettings();
          await realtime.startBroadcast(stream, {
            preset,
            width: settings?.width ?? QUALITY_PROFILES[preset].width ?? 1920,
            height: settings?.height ?? QUALITY_PROFILES[preset].height ?? 1080,
            frameRate: settings?.frameRate ?? frameRate,
            hasAudio: stream.getAudioTracks().length > 0,
          }, bitrate);
          setLocalStream(stream);
          setCapture(null);
          setIsBroadcasting(true);
          setSelectedStreamer(currentUser.id);
        }}
      />
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
  return person.image ? <Image className="member-avatar" src={person.image} alt="" width={32} height={32} /> : <span className="member-avatar fallback">{person.name.slice(0, 1).toUpperCase()}</span>;
}

function MemberRow({ person, online, isOwner, onRevoke }: {
  person: RoomSnapshot["members"][number];
  online: boolean;
  isOwner: boolean;
  onRevoke: (userId: string, action: "approve" | "reject" | "revoke") => Promise<void>;
}) {
  return (
    <div className="member-row">
      <div className="avatar-wrap"><MemberAvatar person={person} /><span data-online={online} /></div>
      <div><strong>{person.name}</strong><span>{person.role === "OWNER" ? "Dono" : online ? "Online" : "Offline"}</span></div>
      {isOwner && person.role !== "OWNER" && <button className="member-menu" type="button" onClick={() => onRevoke(person.userId, "revoke")} aria-label={`Remover ${person.name}`}><X size={15} /></button>}
    </div>
  );
}
