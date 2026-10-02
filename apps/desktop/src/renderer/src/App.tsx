import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthStatus, CaptureSource, RoomSnapshot, RoomSummary, UpdaterStatus } from "../../shared/contracts";
import { useRoomMedia } from "./use-room-media";

type Resolution = "720p" | "1080p" | "1440p" | "source";
type Quality = "auto" | "high" | "custom";

const BITRATES: Record<string, number> = {
  "720p30": 3_500_000,
  "720p60": 5_000_000,
  "1080p30": 6_000_000,
  "1080p60": 10_000_000,
  "1440p30": 10_000_000,
  "1440p60": 16_000_000,
  source: 12_000_000,
};

function expiryLabel(remainingMs: number) {
  const hours = Math.ceil(remainingMs / (60 * 60 * 1_000));
  if (hours <= 1) return "Expira em menos de 1 hora";
  if (hours < 24) return `Expira em ${hours} horas`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Expira amanhã" : `Expira em ${days} dias`;
}

export function App() {
  const [auth, setAuth] = useState<AuthStatus>({ state: "signed-out" });
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [captureName, setCaptureName] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<Quality>("auto");
  const [customBitrate, setCustomBitrate] = useState(10);
  const [systemAudio, setSystemAudio] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [selectedStreamer, setSelectedStreamer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("0.1.0");
  const [update, setUpdate] = useState<UpdaterStatus>({ state: "idle" });
  const previewRef = useRef<HTMLVideoElement>(null);
  const authRef = useRef<AuthStatus>(auth);
  const pendingInviteRef = useRef<string | null>(null);
  const handledMembershipRevisionRef = useRef(0);
  const realtime = useRoomMedia(room?.access === "authorized" ? room.room.id : null);

  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await window.janja.rooms.list());
    } catch {
      setError("Não foi possível carregar suas salas.");
    }
  }, []);

  const openInvite = useCallback(async (token: string) => {
    try {
      setRoom(await window.janja.rooms.openInvite(token));
      pendingInviteRef.current = null;
    } catch {
      setError("Este convite não está mais disponível.");
    }
  }, []);

  const handleAuthStatus = useCallback((next: AuthStatus) => {
    authRef.current = next;
    setAuth(next);
    if (next.state === "signed-in") {
      void refreshRooms();
      const invite = pendingInviteRef.current;
      if (invite) void openInvite(invite);
    } else {
      setRooms([]);
      setRoom(null);
    }
  }, [openInvite, refreshRooms]);

  useEffect(() => {
    void window.janja.app.getVersion().then(setVersion);
    void window.janja.updater.getStatus().then(setUpdate);
    void window.janja.auth.getStatus().then(handleAuthStatus);
    const removeUpdater = window.janja.updater.onStatus(setUpdate);
    const removeAuth = window.janja.auth.onStatus(handleAuthStatus);
    const removeInvite = window.janja.app.onRoomInvite((token) => {
      if (authRef.current.state === "signed-in") void openInvite(token);
      else pendingInviteRef.current = token;
    });
    return () => { removeUpdater(); removeAuth(); removeInvite(); };
  }, [handleAuthStatus, openInvite]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = capture;
  }, [capture]);

  useEffect(() => {
    if (!realtime.roomUnavailable) return;
    const timeout = setTimeout(() => {
      capture?.getTracks().forEach((track) => track.stop());
      localStream?.getTracks().forEach((track) => track.stop());
      setCapture(null);
      setLocalStream(null);
      setSharing(false);
      setSelectedStreamer(null);
      setRoom(null);
      void refreshRooms();
    }, 0);
    return () => clearTimeout(timeout);
  }, [capture, localStream, realtime.roomUnavailable, refreshRooms]);

  useEffect(() => {
    if (
      !room ||
      room.access !== "authorized" ||
      realtime.membershipRevision === 0 ||
      realtime.membershipRevision === handledMembershipRevisionRef.current
    ) return;
    handledMembershipRevisionRef.current = realtime.membershipRevision;
    let cancelled = false;
    void window.janja.rooms.get(room.room.id).then((next) => {
      if (!cancelled) setRoom(next);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [realtime.membershipRevision, room]);

  const groupedSources = useMemo(() => ({
    windows: sources?.filter((source) => source.kind === "window") ?? [],
    screens: sources?.filter((source) => source.kind === "screen") ?? [],
  }), [sources]);

  async function openPicker() {
    setError(null);
    try {
      setSources(await window.janja.capture.listSources());
    } catch {
      setError("Não foi possível listar as telas e aplicações.");
    }
  }

  async function selectSource(source: CaptureSource) {
    setError(null);
    try {
      await window.janja.capture.selectSource({ token: source.token, withSystemAudio: systemAudio });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: systemAudio });
      } catch (audioError) {
        if (!systemAudio) throw audioError;
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }
      setCapture(stream);
      setCaptureName(source.name);
      setSources(null);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void realtime.stopBroadcast();
        setCapture(null);
        setLocalStream(null);
        setSharing(false);
        setSelectedStreamer(null);
      }, { once: true });
    } catch {
      await window.janja.capture.cancelSelection();
      setError("Não foi possível capturar essa fonte. Escolha novamente.");
    }
  }

  function cancelCapture() {
    capture?.getTracks().forEach((track) => track.stop());
    setCapture(null);
  }

  async function startSharing() {
    if (!capture || auth.state !== "signed-in") return;
    const preset = resolution === "source" ? "source" : `${resolution}${fps}` as const;
    const dimensions: [number, number] = resolution === "720p" ? [1280, 720] : resolution === "1440p" ? [2560, 1440] : [1920, 1080];
    const videoTrack = capture.getVideoTracks()[0];
    if (resolution !== "source") {
      await videoTrack?.applyConstraints({
        width: { ideal: dimensions[0], max: dimensions[0] },
        height: { ideal: dimensions[1], max: dimensions[1] },
        frameRate: { ideal: fps, max: fps },
      }).catch(() => undefined);
    } else {
      await videoTrack?.applyConstraints({ frameRate: { ideal: fps, max: fps } }).catch(() => undefined);
    }
    const settings = videoTrack?.getSettings();
    const baseBitrate = BITRATES[preset] ?? 10_000_000;
    const bitrate = quality === "custom"
      ? Math.min(25, Math.max(2, customBitrate)) * 1_000_000
      : quality === "high"
        ? Math.min(25_000_000, Math.round(baseBitrate * 1.35))
        : baseBitrate;
    await realtime.startBroadcast(capture, {
      preset,
      width: settings?.width ?? dimensions[0],
      height: settings?.height ?? dimensions[1],
      frameRate: settings?.frameRate ?? fps,
      hasAudio: capture.getAudioTracks().some((track) => track.readyState === "live"),
    }, bitrate);
    setLocalStream(capture);
    setCapture(null);
    setSharing(true);
    setSelectedStreamer(auth.user.id);
  }

  async function stopSharing() {
    if (sharing) await realtime.stopBroadcast();
    capture?.getTracks().forEach((track) => track.stop());
    localStream?.getTracks().forEach((track) => track.stop());
    setCapture(null);
    setLocalStream(null);
    setSharing(false);
    if (auth.state === "signed-in" && selectedStreamer === auth.user.id) setSelectedStreamer(null);
  }

  function leaveRoom() {
    if (sharing || capture) void stopSharing();
    if (selectedStreamer && auth.state === "signed-in" && selectedStreamer !== auth.user.id) {
      void realtime.stopWatching(selectedStreamer);
    }
    setSelectedStreamer(null);
    setRoom(null);
    void refreshRooms();
  }

  async function logout() {
    if (sharing || capture) return;
    if (selectedStreamer) await realtime.stopWatching(selectedStreamer).catch(() => undefined);
    setRoom(null);
    await window.janja.auth.logout();
  }

  const activeRemoteStreams = realtime.activeStreams.filter((stream) => auth.state !== "signed-in" || stream.streamerUserId !== auth.user.id);
  const selectedRemoteStream = selectedStreamer ? realtime.remoteStreams[selectedStreamer] : undefined;

  return (
    <main className="desktop-shell">
      <Header auth={auth} version={version} update={update} inRoom={Boolean(room)} canLogout={!sharing && !capture} onLeaveRoom={leaveRoom} onLogout={logout} />

      {update.state === "ready" && <aside className="update-bar"><span>JanjaLive v{update.version} está pronto.</span><button type="button" onClick={() => void window.janja.updater.restartAndInstall()}>Reiniciar e atualizar</button></aside>}
      {update.state === "required" && <aside className="update-bar required"><span>Esta versão precisa ser atualizada para continuar.</span><button type="button" onClick={() => void window.janja.updater.check()}>Verificar atualização</button></aside>}

      {auth.state !== "signed-in" ? <Login auth={auth} /> : room ? (
        room.access === "authorized" ? <RoomView room={room} currentUserId={auth.user.id} sharing={sharing} localStream={localStream} selectedStreamer={selectedStreamer} selectedRemoteStream={selectedRemoteStream} activeStreams={activeRemoteStreams} onlineUserIds={realtime.onlineUserIds} connectionStatus={realtime.connectionStatus} onRoomUpdate={setRoom} onRoomDeleted={() => { setRoom(null); void refreshRooms(); }} onShare={openPicker} onStopSharing={stopSharing} onSelectStreamer={(userId) => { setSelectedStreamer(userId); void realtime.watch(userId); }} onStopWatching={() => { if (selectedStreamer) void realtime.stopWatching(selectedStreamer); setSelectedStreamer(null); }} />
        : <AccessGate room={room} onUpdate={setRoom} onRequest={async () => { await window.janja.rooms.requestAccess(room.room.id); setRoom({ ...room, access: "pending" }); }} />
      ) : <Home rooms={rooms} onOpen={async (roomId) => setRoom(await window.janja.rooms.get(roomId))} onOpenSnapshot={setRoom} onRefresh={refreshRooms} />}

      {capture && <CaptureConfig stream={capture} previewRef={previewRef} name={captureName} resolution={resolution} fps={fps} quality={quality} customBitrate={customBitrate} onResolution={setResolution} onFps={setFps} onQuality={setQuality} onCustomBitrate={setCustomBitrate} onCancel={cancelCapture} onStart={startSharing} />}

      {sources && <SourcePicker sources={groupedSources} systemAudio={systemAudio} onSystemAudio={setSystemAudio} onSelect={selectSource} onClose={() => { setSources(null); void window.janja.capture.cancelSelection(); }} />}

      {(error || auth.state === "error" || realtime.connectionError) && <div className="error-toast" role="alert">{error || (auth.state === "error" ? auth.message : realtime.connectionError)}<button type="button" onClick={() => { setError(null); if (auth.state === "error") setAuth({ state: "signed-out" }); }}>×</button></div>}
    </main>
  );
}

function Header({ auth, version, update, inRoom, canLogout, onLeaveRoom, onLogout }: { auth: AuthStatus; version: string; update: UpdaterStatus; inRoom: boolean; canLogout: boolean; onLeaveRoom: () => void; onLogout: () => Promise<void> }) {
  return <header className="app-header"><div className="brand"><img src="/janja-live.png" alt="" /><span>JanjaLive</span></div><div className="header-actions">{inRoom && <button className="quiet-button" type="button" onClick={onLeaveRoom}>Sair da sala</button>}<span className="version">v{version}</span><button className="quiet-button" type="button" onClick={() => void window.janja.updater.check()}>{update.state === "checking" ? "Verificando…" : "Atualizações"}</button>{auth.state === "signed-in" && <details className="desktop-account-menu"><summary className="account-button">{auth.user.image ? <img src={auth.user.image} alt="" /> : <span className="avatar-fallback">{auth.user.name[0]}</span>}<span>{auth.user.name}</span></summary><div><button type="button" disabled={!canLogout} onClick={() => void onLogout()}>Sair da conta</button></div></details>}</div></header>;
}

function Login({ auth }: { auth: AuthStatus }) {
  return <section className="desktop-login"><img src="/janja-live.png" alt="" /><h1>JanjaLive</h1><p>Entre para abrir suas salas.</p><button className="primary-button" type="button" disabled={auth.state === "connecting"} onClick={() => void window.janja.auth.start()}>{auth.state === "connecting" ? "Abrindo o navegador…" : "Entrar com Discord"}</button></section>;
}

function Home({ rooms, onOpen, onOpenSnapshot, onRefresh }: { rooms: RoomSummary[]; onOpen: (id: string) => Promise<void>; onOpenSnapshot: (room: RoomSnapshot) => void; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function createRoom() { setBusy(true); try { onOpenSnapshot(await window.janja.rooms.create({ name: name || undefined, accessMode: "APPROVAL" })); } finally { setBusy(false); } }
  async function joinCode() { if (!/^[2-9A-HJ-NP-Z]{7}$/.test(code)) return; setBusy(true); try { onOpenSnapshot(await window.janja.rooms.joinCode(code)); } finally { setBusy(false); void onRefresh(); } }
  return <section className="desktop-home"><div><p className="eyebrow">Suas salas</p><h1>Salas</h1><p>Abra uma sala e comece a compartilhar.</p></div><div className="desktop-room-grid"><div className="room-list-card">{rooms.length ? rooms.map((item) => <button type="button" key={item.id} onClick={() => void onOpen(item.id)}><span><strong>{item.name}</strong><small>{item.role === "OWNER" ? "Sua sala" : "Membro"} · {expiryLabel(item.expiresInMs)}</small></span><b>Abrir</b></button>) : <p>Nenhuma sala disponível.</p>}</div><div className="new-room-card"><h2>Nova sala</h2><input value={name} maxLength={60} placeholder="Nome opcional" onChange={(event) => setName(event.target.value)} /><button className="primary-button" type="button" disabled={busy} onClick={() => void createRoom()}>Criar sala</button><span>ou entre com código</span><input value={code} maxLength={7} placeholder="XXXXXXX" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") void joinCode(); }} /></div></div></section>;
}

function AccessGate({ room, onRequest, onUpdate }: { room: RoomSnapshot; onRequest: () => Promise<void>; onUpdate: (room: RoomSnapshot) => void }) {
  useEffect(() => {
    if (room.access !== "pending") return;
    let stopped = false;
    const interval = setInterval(() => {
      void window.janja.rooms.getPublic(room.room.publicId).then((next) => {
        if (!stopped) onUpdate(next);
      }).catch(() => undefined);
    }, 3_000);
    return () => { stopped = true; clearInterval(interval); };
  }, [onUpdate, room.access, room.room.publicId]);
  return <section className="desktop-login"><h1>{room.room.name}</h1><p>{room.access === "pending" ? "Aguardando aprovação do dono da sala." : room.access === "rejected" ? "Seu pedido não foi aceito." : "Você precisa de aprovação para entrar."}</p>{room.access === "invited" && <button className="primary-button" type="button" onClick={() => void onRequest()}>Solicitar acesso</button>}</section>;
}

function RoomView({ room, currentUserId, sharing, localStream, selectedStreamer, selectedRemoteStream, activeStreams, onlineUserIds, connectionStatus, onRoomUpdate, onRoomDeleted, onShare, onStopSharing, onSelectStreamer, onStopWatching }: { room: RoomSnapshot; currentUserId: string; sharing: boolean; localStream: MediaStream | null; selectedStreamer: string | null; selectedRemoteStream?: MediaStream; activeStreams: Array<{ streamerUserId: string; preset: string; hasAudio: boolean }>; onlineUserIds: string[]; connectionStatus: "good" | "unstable" | "reconnecting"; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void; onShare: () => Promise<void>; onStopSharing: () => Promise<void>; onSelectStreamer: (id: string) => void; onStopWatching: () => void }) {
  const members = new Map(room.members.map((member) => [member.userId, member]));
  const showingLocal = selectedStreamer === currentUserId && localStream;
  const stream = showingLocal ? localStream : selectedRemoteStream;
  return <div className="desktop-room-layout"><section className="desktop-stage-column"><div className="room-heading"><div><h1>{room.room.name}</h1>{connectionStatus !== "good" && <span>{connectionStatus === "unstable" ? "Conexão instável" : "Reconectando…"}</span>}</div>{!sharing && <button className="primary-button" type="button" onClick={() => void onShare()}>Compartilhar tela</button>}</div><div className="desktop-stage">{stream ? <Player stream={stream} label={showingLocal ? "Sua transmissão" : members.get(selectedStreamer ?? "")?.name ?? "Transmissão"} own={Boolean(showingLocal)} onStop={showingLocal ? () => void onStopSharing() : onStopWatching} /> : activeStreams.length ? <div className="desktop-stream-list"><h2>Transmissões</h2>{activeStreams.map((item) => <button type="button" key={item.streamerUserId} onClick={() => onSelectStreamer(item.streamerUserId)}><span className="live-dot" /><span><strong>{members.get(item.streamerUserId)?.name ?? "Amigo"}</strong><small>AO VIVO · {item.preset.replace(/(\d+p)(\d+)/, "$1 · $2 FPS")}{item.hasAudio ? " · Áudio" : ""}</small></span><b>Assistir</b></button>)}</div> : <div className="empty-room"><h2>Nenhuma transmissão ativa</h2><p>Compartilhe sua tela ou aguarde um amigo começar.</p></div>}</div></section><RoomMembers room={room} onlineUserIds={onlineUserIds} currentUserId={currentUserId} onRoomUpdate={onRoomUpdate} onRoomDeleted={onRoomDeleted} /></div>;
}

function RoomMembers({ room, onlineUserIds, currentUserId, onRoomUpdate, onRoomDeleted }: { room: RoomSnapshot; onlineUserIds: string[]; currentUserId: string; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function manage(userId: string, action: "approve" | "reject" | "revoke") {
    onRoomUpdate(await window.janja.rooms.manageMember(room.room.id, { userId, action }));
  }
  async function copyInvite() {
    await window.janja.rooms.copyInvite(room.room.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }
  async function removeRoom() {
    if (!confirmDelete) return setConfirmDelete(true);
    await window.janja.rooms.delete(room.room.id);
    onRoomDeleted();
  }
  const online = room.members.filter((member) => onlineUserIds.includes(member.userId));
  return <aside className="desktop-members"><h2>Membros <span>{room.members.length}</span></h2>{room.pending.length > 0 && <section className="member-section pending-members"><h3>Pedidos</h3>{room.pending.map((member) => <div className="pending-member" key={member.userId}><Member member={{ ...member, role: "MEMBER" }} online={false} /><div><button type="button" onClick={() => void manage(member.userId, "approve")}>Aprovar</button><button type="button" onClick={() => void manage(member.userId, "reject")}>Recusar</button></div></div>)}</section>}<section className="member-section"><h3>Online</h3>{online.length ? online.map((member) => <Member key={member.userId} member={member} online />) : <p className="members-empty">Ninguém online.</p>}</section><section className="member-section"><h3>Autorizados</h3>{room.members.map((member) => <div className="authorized-member" key={member.userId}><Member member={member} online={onlineUserIds.includes(member.userId)} />{room.room.isOwner && member.userId !== currentUserId && <button type="button" onClick={() => void manage(member.userId, "revoke")}>Remover</button>}</div>)}</section>{room.room.isOwner && <footer className="room-owner-actions"><button type="button" onClick={() => void copyInvite()}>{copied ? "Novo convite copiado" : "Copiar novo convite"}</button><button className="danger-control" type="button" onBlur={() => setConfirmDelete(false)} onClick={() => void removeRoom()}>{confirmDelete ? "Confirmar exclusão" : "Excluir sala"}</button></footer>}</aside>;
}

function Player({ stream, label, own, onStop }: { stream: MediaStream; label: string; own: boolean; onStop: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(own);
  const [volume, setVolume] = useState(1);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <div className="desktop-player"><video ref={ref} autoPlay muted={muted} playsInline /><div><span>{label}</span><div className="player-actions"><button type="button" onClick={() => setMuted((value) => !value)}>{muted ? "Ativar som" : "Silenciar"}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (ref.current) ref.current.volume = next; }} /><button type="button" onClick={() => void ref.current?.requestPictureInPicture?.()}>PiP</button><button type="button" onClick={() => void ref.current?.requestFullscreen()}>Tela cheia</button><button type="button" className="danger-control" onClick={onStop}>{own ? "Encerrar" : "Parar"}</button></div></div></div>;
}

function Member({ member, online }: { member: RoomSnapshot["members"][number]; online: boolean }) {
  return <div className="desktop-member">{member.image ? <img src={member.image} alt="" /> : <span>{member.name[0]}</span>}<div><strong>{member.name}</strong><small>{member.role === "OWNER" ? "Dono" : online ? "Online" : "Offline"}</small></div><i data-online={online} /></div>;
}

function CaptureConfig({ stream, previewRef, name, resolution, fps, quality, customBitrate, onResolution, onFps, onQuality, onCustomBitrate, onCancel, onStart }: { stream: MediaStream; previewRef: React.RefObject<HTMLVideoElement | null>; name: string; resolution: Resolution; fps: 30 | 60; quality: Quality; customBitrate: number; onResolution: (value: Resolution) => void; onFps: (value: 30 | 60) => void; onQuality: (value: Quality) => void; onCustomBitrate: (value: number) => void; onCancel: () => void; onStart: () => Promise<void> }) {
  return <div className="modal-backdrop"><section className="capture-panel capture-modal"><video ref={previewRef} autoPlay muted playsInline /><div className="capture-title"><strong>{name}</strong><span>{stream.getAudioTracks().length ? "Áudio do sistema" : "Áudio do sistema indisponível"}</span></div><div className="capture-settings"><OptionGroup label="Resolução" value={resolution} values={["720p", "1080p", "1440p", "source"]} labels={{ source: "Fonte" }} onChange={(value) => onResolution(value as Resolution)} /><OptionGroup label="FPS" value={String(fps)} values={["30", "60"]} onChange={(value) => onFps(value === "60" ? 60 : 30)} /><div><OptionGroup label="Qualidade" value={quality} values={["auto", "high", "custom"]} labels={{ auto: "Auto", high: "Alta", custom: "Personalizada" }} onChange={(value) => onQuality(value as Quality)} />{quality === "custom" && <label className="custom-bitrate"><span>Mbps</span><input type="number" min="2" max="25" value={customBitrate} onChange={(event) => onCustomBitrate(Number(event.target.value))} /></label>}</div><div className="capture-actions"><button className="quiet-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" type="button" onClick={() => void onStart()}>Compartilhar</button></div></div></section></div>;
}

function SourcePicker({ sources, systemAudio, onSystemAudio, onSelect, onClose }: { sources: { windows: CaptureSource[]; screens: CaptureSource[] }; systemAudio: boolean; onSystemAudio: (value: boolean) => void; onSelect: (source: CaptureSource) => Promise<void>; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-title"><header><div><h2 id="source-title">Compartilhe sua tela</h2><p>Escolha uma aplicação ou monitor.</p></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></header><label className="audio-toggle"><input type="checkbox" checked={systemAudio} onChange={(event) => onSystemAudio(event.target.checked)} /><span>Áudio do sistema</span></label><SourceGroup title="Aplicações" sources={sources.windows} onSelect={onSelect} /><SourceGroup title="Telas" sources={sources.screens} onSelect={onSelect} /></section></div>;
}

function SourceGroup({ title, sources, onSelect }: { title: string; sources: CaptureSource[]; onSelect: (source: CaptureSource) => Promise<void> }) {
  if (!sources.length) return null;
  return <section className="source-group"><h3>{title}</h3><div className="source-grid">{sources.map((source) => <button type="button" key={source.token} onClick={() => void onSelect(source)}><img src={source.thumbnailDataUrl} alt="" /><span>{source.name}</span></button>)}</div></section>;
}

function OptionGroup({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <fieldset><legend>{label}</legend><div className="options">{values.map((option) => <button type="button" data-active={value === option} key={option} onClick={() => onChange(option)}>{labels[option] ?? option}</button>)}</div></fieldset>;
}
