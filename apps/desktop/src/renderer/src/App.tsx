import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleStop, Copy, LogOut, Maximize, Minimize2, PictureInPicture2, Play, Scaling, Trash2, UserMinus, Volume2, VolumeX, X } from "lucide-react";
import { playRoomCue, type ConnectionStatus, type StreamMetadata } from "@janjalive/webrtc";
import type { AuthStatus, CaptureSource, RoomSnapshot, RoomSummary, UpdaterStatus } from "../../shared/contracts";
import { useRoomMedia } from "./use-room-media";

type Resolution = "720p" | "1080p" | "1440p" | "source";
type Quality = "auto" | "high" | "custom";
const ROOM_CODE_LENGTH = 7;

function normalizeRoomCode(value: string) {
  return (value.toUpperCase().match(/[2-9A-HJ-NP-Z]/g) ?? []).join("").slice(0, ROOM_CODE_LENGTH);
}

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
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const authRef = useRef<AuthStatus>(auth);
  const pendingInviteRef = useRef<string | null>(null);
  const handledMembershipRevisionRef = useRef(0);
  const knownStreamsRef = useRef<Set<string> | null>(null);
  const realtime = useRoomMedia(room?.access === "authorized" ? room.room.id : null);

  const handleUpdateStatus = useCallback((next: UpdaterStatus) => {
    setUpdate(next);
    if (next.state !== "ready") setUpdateDialogOpen(false);
  }, []);

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
    document.title = "JanjaLive";
    void window.janja.app.getVersion().then(setVersion);
    void window.janja.updater.getStatus().then(handleUpdateStatus);
    void window.janja.auth.getStatus().then(handleAuthStatus);
    const removeUpdater = window.janja.updater.onStatus(handleUpdateStatus);
    const removeAuth = window.janja.auth.onStatus(handleAuthStatus);
    const removeInvite = window.janja.app.onRoomInvite((token) => {
      if (authRef.current.state === "signed-in") void openInvite(token);
      else pendingInviteRef.current = token;
    });
    return () => { removeUpdater(); removeAuth(); removeInvite(); };
  }, [handleAuthStatus, handleUpdateStatus, openInvite]);

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
      await window.janja.capture.cancelSelection();
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
    const metadata: StreamMetadata = {
      preset,
      width: settings?.width ?? dimensions[0],
      height: settings?.height ?? dimensions[1],
      frameRate: settings?.frameRate ?? fps,
      hasAudio: capture.getAudioTracks().some((track) => track.readyState === "live"),
    };
    if (sharing) await realtime.replaceBroadcast(capture, metadata, bitrate);
    else {
      await realtime.startBroadcast(capture, metadata, bitrate);
      await playRoomCue("stream-start", true);
    }
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
  const signedInUserId = auth.state === "signed-in" ? auth.user.id : null;
  const stopWatching = realtime.stopWatching;

  useEffect(() => {
    const current = new Set(activeRemoteStreams.map((stream) => stream.streamerUserId));
    const known = knownStreamsRef.current;
    if (known && activeRemoteStreams.some((stream) => !known.has(stream.streamerUserId))) {
      void playRoomCue("stream-start");
    }
    knownStreamsRef.current = current;
  }, [activeRemoteStreams]);

  async function watchStreamer(userId: string) {
    if (selectedStreamer && selectedStreamer !== signedInUserId && selectedStreamer !== userId) {
      await realtime.stopWatching(selectedStreamer).catch(() => undefined);
    }
    setSelectedStreamer(userId);
    await playRoomCue("join", true);
    await realtime.watch(userId);
  }

  async function leaveStream() {
    if (selectedStreamer) await realtime.stopWatching(selectedStreamer);
    setSelectedStreamer(null);
    await playRoomCue("leave", true);
  }

  useEffect(() => {
    if (!selectedStreamer || !signedInUserId || selectedStreamer === signedInUserId) return;
    if (realtime.activeStreams.some((stream) => stream.streamerUserId === selectedStreamer)) return;
    const timeout = window.setTimeout(() => {
      void stopWatching(selectedStreamer);
      setSelectedStreamer(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [realtime.activeStreams, selectedStreamer, signedInUserId, stopWatching]);

  return (
    <main className="desktop-shell">
      <Header auth={auth} version={version} update={update} inRoom={Boolean(room)} canLogout={!sharing && !capture} onLeaveRoom={leaveRoom} onLogout={logout} onShowUpdate={() => setUpdateDialogOpen(true)} />

      {update.state === "required" && <aside className="update-bar required"><span>Esta versão precisa ser atualizada para continuar.</span><button type="button" onClick={() => void window.janja.updater.check()}>Verificar atualização</button></aside>}

      {auth.state !== "signed-in" ? <Login auth={auth} /> : room ? (
        room.access === "authorized" ? <RoomView room={room} currentUserId={auth.user.id} sharing={sharing} localStream={localStream} selectedStreamer={selectedStreamer} selectedRemoteStream={selectedRemoteStream} activeStreams={activeRemoteStreams} onlineUserIds={realtime.onlineUserIds} connectionStatus={realtime.connectionStatus} onRoomUpdate={setRoom} onRoomDeleted={() => { setRoom(null); void refreshRooms(); }} onShare={openPicker} onStopSharing={stopSharing} onSelectStreamer={(userId) => void watchStreamer(userId)} onStopWatching={() => void leaveStream()} />
        : <AccessGate room={room} onUpdate={setRoom} onRequest={async () => { await window.janja.rooms.requestAccess(room.room.id); setRoom({ ...room, access: "pending" }); }} />
      ) : <Home rooms={rooms} onOpen={async (roomId) => setRoom(await window.janja.rooms.get(roomId))} onOpenSnapshot={setRoom} onRefresh={refreshRooms} />}

      {capture && <CaptureConfig stream={capture} previewRef={previewRef} name={captureName} resolution={resolution} fps={fps} quality={quality} customBitrate={customBitrate} onResolution={setResolution} onFps={setFps} onQuality={setQuality} onCustomBitrate={setCustomBitrate} onCancel={cancelCapture} onStart={startSharing} />}

      {sources && <SourcePicker sources={groupedSources} systemAudio={systemAudio} onSystemAudio={setSystemAudio} onSelect={selectSource} onClose={() => { setSources(null); void window.janja.capture.cancelSelection(); }} />}

      {update.state === "ready" && updateDialogOpen && <UpdateDialog version={update.version} onClose={() => setUpdateDialogOpen(false)} />}

      {(error || auth.state === "error" || realtime.connectionError) && <div className="error-toast" role="alert">{error || (auth.state === "error" ? auth.message : realtime.connectionError)}<button type="button" onClick={() => { setError(null); if (auth.state === "error") setAuth({ state: "signed-out" }); }}>×</button></div>}
    </main>
  );
}

function UpdateDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="update-dialog" aria-labelledby="update-dialog-title" onCancel={onClose}><h2 id="update-dialog-title">Atualizar JanjaLive?</h2><p>A versão {version} já foi baixada. O aplicativo será reiniciado para concluir a instalação.</p><div><button className="quiet-button" type="button" onClick={onClose}>Agora não</button><button className="primary-button" type="button" onClick={() => void window.janja.updater.restartAndInstall()}>Reiniciar e atualizar</button></div></dialog>;
}

function Header({ auth, version, update, inRoom, canLogout, onLeaveRoom, onLogout, onShowUpdate }: { auth: AuthStatus; version: string; update: UpdaterStatus; inRoom: boolean; canLogout: boolean; onLeaveRoom: () => void; onLogout: () => Promise<void>; onShowUpdate: () => void }) {
  return <header className="app-header"><div className="brand"><img src="/janja-live.png" alt="" /><span>JanjaLive</span></div><div className="header-actions">{inRoom && <button className="header-icon-action" data-tooltip="Sair da sala" aria-label="Sair da sala" type="button" onClick={onLeaveRoom}><LogOut size={17} /></button>}<span className="version">v{version}</span>{update.state === "checking" && <span className="update-checking" data-tooltip="Verificando atualização" role="status" aria-label="Verificando atualização" />}{update.state === "ready" && <button className="update-indicator" type="button" onClick={onShowUpdate}><span />Nova versão</button>}{auth.state === "signed-in" && <details className="desktop-account-menu"><summary className="account-button">{auth.user.image ? <img src={auth.user.image} alt="" /> : <span className="avatar-fallback">{auth.user.name[0]}</span>}<span>{auth.user.name}</span></summary><div><button type="button" disabled={!canLogout} onClick={() => void onLogout()}>Sair da conta</button></div></details>}</div></header>;
}

function Login({ auth }: { auth: AuthStatus }) {
  return <section className="desktop-login desktop-noir-screen"><img src="/janja-live.png" alt="" /><h1>JanjaLive</h1><p>Entre para abrir suas salas.</p>{auth.state === "connecting" ? <div className="login-actions"><span>Aguardando o navegador…</span><button className="quiet-button" type="button" onClick={() => void window.janja.auth.cancel()}>Cancelar</button></div> : <button className="primary-button" type="button" onClick={() => void window.janja.auth.start()}>Entrar com Discord</button>}</section>;
}

function Home({ rooms, onOpen, onOpenSnapshot, onRefresh }: { rooms: RoomSummary[]; onOpen: (id: string) => Promise<void>; onOpenSnapshot: (room: RoomSnapshot) => void; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  async function createRoom() { setBusy(true); try { onOpenSnapshot(await window.janja.rooms.create({ name: name || undefined, accessMode: "APPROVAL" })); } finally { setBusy(false); } }
  async function joinCode(roomCode: string) { if (busy || !/^[2-9A-HJ-NP-Z]{7}$/.test(roomCode)) return; setBusy(true); try { onOpenSnapshot(await window.janja.rooms.joinCode(roomCode)); } finally { setBusy(false); void onRefresh(); } }
  function updateCode(value: string) {
    const nextCode = normalizeRoomCode(value);
    setCode(nextCode);
    if (nextCode.length === ROOM_CODE_LENGTH) void joinCode(nextCode);
  }
  return <section className="desktop-home desktop-noir-screen">
    <div className="home-heading"><h1>Salas</h1><p>Crie uma sala ou entre com um código.</p></div>
    <div className="desktop-room-grid">
      <section className="room-list-card" aria-label="Salas disponíveis">
        {rooms.length ? rooms.map((item) => <button type="button" key={item.id} onClick={() => void onOpen(item.id)}><span><strong>{item.name}</strong><small>{item.role === "OWNER" ? "Sua sala" : "Membro"} · {expiryLabel(item.expiresInMs)}</small></span><b>Abrir</b></button>) : <p>Nenhuma sala disponível.</p>}
      </section>
      <section className="new-room-card">
        <h2>Nova sala</h2>
        <label><span>Nome da sala</span><input value={name} maxLength={60} placeholder="Opcional" onChange={(event) => setName(event.target.value)} /></label>
        <button className="primary-button" type="button" disabled={busy} onClick={() => void createRoom()}>Criar sala</button>
        <span className="room-code-divider">ou entre com código</span>
        <div className="room-code-field">
          <span className="room-code-label">Código do convite</span>
          <label className="room-code-entry" data-loading={busy} htmlFor="desktop-room-code">
            <input
              ref={codeInputRef}
              id="desktop-room-code"
              aria-label="Código da sala, 7 caracteres"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={busy}
              inputMode="text"
              maxLength={ROOM_CODE_LENGTH}
              onChange={(event) => updateCode(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void joinCode(code); }}
              spellCheck={false}
              value={code}
            />
            <span className="room-code-slots" aria-hidden="true">
              {Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => <span className="room-code-slot" data-active={!busy && index === code.length} data-filled={Boolean(code[index])} key={index}>{code[index] ?? ""}</span>)}
            </span>
          </label>
        </div>
      </section>
    </div>
  </section>;
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

function RoomView({ room, currentUserId, sharing, localStream, selectedStreamer, selectedRemoteStream, activeStreams, onlineUserIds, connectionStatus, onRoomUpdate, onRoomDeleted, onShare, onStopSharing, onSelectStreamer, onStopWatching }: { room: RoomSnapshot; currentUserId: string; sharing: boolean; localStream: MediaStream | null; selectedStreamer: string | null; selectedRemoteStream?: MediaStream; activeStreams: Array<{ streamerUserId: string; preset: string; hasAudio: boolean }>; onlineUserIds: string[]; connectionStatus: ConnectionStatus; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void; onShare: () => Promise<void>; onStopSharing: () => Promise<void>; onSelectStreamer: (id: string) => void; onStopWatching: () => void }) {
  const members = new Map(room.members.map((member) => [member.userId, member]));
  const [codeCopied, setCodeCopied] = useState(false);
  const showingLocal = selectedStreamer === currentUserId && localStream;
  const stream = showingLocal ? localStream : selectedRemoteStream;
  async function copyRoomCode() {
    await window.janja.rooms.copyCode(room.room.code);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1_800);
  }
  return <div className="desktop-room-layout"><section className="desktop-stage-column"><div className="room-heading"><div className="room-heading-identity"><h1>{room.room.name}</h1><button className="room-code-display" type="button" onClick={() => void copyRoomCode()} aria-label={`Copiar código da sala ${room.room.code}`}><span>{codeCopied ? "Copiado" : "Código"}</span><strong>{room.room.code}</strong></button>{connectionStatus !== "good" && <span className={`connection-warning ${connectionStatus}`}>{connectionStatus === "unstable" ? "Conexão instável" : connectionStatus === "connecting" ? "Conectando…" : "Reconectando…"}</span>}</div>{sharing ? <button className="quiet-button" type="button" onClick={() => void onShare()}>Trocar tela</button> : <button className="primary-button" type="button" onClick={() => void onShare()}>Compartilhar tela</button>}</div><div className="desktop-stage">{stream ? <Player stream={stream} label={showingLocal ? "Sua transmissão" : members.get(selectedStreamer ?? "")?.name ?? "Transmissão"} own={Boolean(showingLocal)} onStop={showingLocal ? () => void onStopSharing() : onStopWatching} /> : activeStreams.length ? <div className="desktop-stream-list"><div className="desktop-stream-heading"><h2>Transmissões</h2><span>{activeStreams.length} {activeStreams.length === 1 ? "disponível" : "disponíveis"}</span></div>{activeStreams.map((item) => {
    const member = members.get(item.streamerUserId);
    const name = member?.name ?? "Amigo";
    return <button type="button" key={item.streamerUserId} onClick={() => onSelectStreamer(item.streamerUserId)}>{member?.image ? <img src={member.image} alt="" /> : <span className="stream-avatar-fallback">{name[0]}</span>}<span><strong>{name}</strong><small><b>AO VIVO</b> {item.preset.replace(/(\d+p)(\d+)/, "$1 · $2 FPS")}{item.hasAudio ? " · Áudio" : ""}</small></span><span className="watch-action">Assistir</span></button>;
  })}</div> : selectedStreamer ? <div className="desktop-stream-connecting"><span>Conectando à transmissão…</span><button type="button" className="quiet-button" onClick={onStopWatching}>Cancelar</button></div> : <div className="empty-room"><div><h2>Nenhuma transmissão ativa</h2><p>Compartilhe sua tela ou aguarde um amigo começar.</p></div></div>}</div></section><RoomMembers room={room} onlineUserIds={onlineUserIds} currentUserId={currentUserId} activeStreamerIds={new Set(activeStreams.map((item) => item.streamerUserId))} selectedStreamer={selectedStreamer} onWatch={onSelectStreamer} onRoomUpdate={onRoomUpdate} onRoomDeleted={onRoomDeleted} /></div>;
}

function RoomMembers({ room, onlineUserIds, currentUserId, activeStreamerIds, selectedStreamer, onWatch, onRoomUpdate, onRoomDeleted }: { room: RoomSnapshot; onlineUserIds: string[]; currentUserId: string; activeStreamerIds: Set<string>; selectedStreamer: string | null; onWatch: (userId: string) => void; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void }) {
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
  return <aside className="desktop-members"><h2>Membros <span>{room.members.length}</span></h2>{room.pending.length > 0 && <section className="member-section pending-members"><h3>Pedidos</h3>{room.pending.map((member) => <div className="pending-member" key={member.userId}><Member member={{ ...member, role: "MEMBER" }} online={false} /><div><button data-tooltip={`Aprovar ${member.name}`} aria-label={`Aprovar ${member.name}`} type="button" onClick={() => void manage(member.userId, "approve")}><Check size={14} /></button><button data-tooltip={`Recusar ${member.name}`} aria-label={`Recusar ${member.name}`} type="button" onClick={() => void manage(member.userId, "reject")}><X size={14} /></button></div></div>)}</section>}<section className="member-section"><h3>Online</h3>{online.length ? online.map((member) => <Member key={member.userId} member={member} online streaming={activeStreamerIds.has(member.userId)} selected={selectedStreamer === member.userId} onWatch={member.userId !== currentUserId ? () => onWatch(member.userId) : undefined} />) : <p className="members-empty">Ninguém online.</p>}</section><section className="member-section"><h3>Autorizados</h3>{room.members.map((member) => <Member key={member.userId} member={member} online={onlineUserIds.includes(member.userId)} streaming={activeStreamerIds.has(member.userId)} selected={selectedStreamer === member.userId} onWatch={member.userId !== currentUserId ? () => onWatch(member.userId) : undefined} onRemove={room.room.isOwner && member.userId !== currentUserId ? () => void manage(member.userId, "revoke") : undefined} />)}</section>{room.room.isOwner && <footer className="room-owner-actions"><button data-tooltip={copied ? "Convite copiado" : "Copiar novo convite"} aria-label={copied ? "Convite copiado" : "Copiar novo convite"} type="button" onClick={() => void copyInvite()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button><button data-tooltip={confirmDelete ? "Confirmar exclusão" : "Excluir sala"} aria-label={confirmDelete ? "Confirmar exclusão" : "Excluir sala"} className="danger-control" type="button" onBlur={() => setConfirmDelete(false)} onClick={() => void removeRoom()}><Trash2 size={15} /></button></footer>}</aside>;
}

function Player({ stream, label, own, onStop }: { stream: MediaStream; label: string; own: boolean; onStop: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(own);
  const [volume, setVolume] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = own;
    setMuted(own);
    setPlaying(false);
    setFitMode("contain");
    void video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => undefined);
    });
  }, [own, stream]);
  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  }
  return <div className="desktop-player" data-fit={fitMode} ref={containerRef}><video ref={ref} autoPlay muted={muted} playsInline onDoubleClick={() => void toggleFullscreen()} onPlaying={() => setPlaying(true)} onWaiting={() => setPlaying(false)} />{!playing && <div className="desktop-player-waiting">Conectando à transmissão…</div>}<div className="desktop-player-controls"><span>{label}</span><div className="player-actions"><button className="icon-action" data-tooltip={muted ? "Ativar som" : "Silenciar"} aria-label={muted ? "Ativar som" : "Silenciar"} type="button" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (ref.current) ref.current.volume = next; }} /><button className="icon-action" data-tooltip={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} aria-label={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} type="button" onClick={() => setFitMode((value) => value === "contain" ? "cover" : "contain")}><Scaling size={16} /></button><button className="icon-action" data-tooltip="Picture in Picture" aria-label="Picture in Picture" type="button" onClick={() => void ref.current?.requestPictureInPicture?.()}><PictureInPicture2 size={16} /></button><button className="icon-action" data-tooltip={fullscreen ? "Sair da tela cheia" : "Tela cheia"} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16} /> : <Maximize size={16} />}</button><button className="icon-action danger-control" data-tooltip={own ? "Encerrar transmissão" : "Parar de assistir"} aria-label={own ? "Encerrar transmissão" : "Parar de assistir"} type="button" onClick={onStop}><CircleStop size={16} /></button></div></div></div>;
}

function Member({ member, online, streaming = false, selected = false, onWatch, onRemove }: { member: RoomSnapshot["members"][number]; online: boolean; streaming?: boolean; selected?: boolean; onWatch?: () => void; onRemove?: () => void }) {
  return <div className="desktop-member">{member.image ? <img src={member.image} alt="" /> : <span>{member.name[0]}</span>}<div><strong>{member.name}</strong><small>{streaming ? `${member.role === "OWNER" ? "Dono · " : ""}Transmitindo` : member.role === "OWNER" ? "Dono" : online ? "Online" : "Offline"}</small></div><div className="member-end">{streaming && onWatch && <button className="member-watch" data-tooltip={selected ? `Assistindo ${member.name}` : `Assistir ${member.name}`} aria-label={selected ? `Assistindo ${member.name}` : `Assistir ${member.name}`} disabled={selected} type="button" onClick={onWatch}><Play size={13} fill="currentColor" /></button>}{onRemove && <button className="member-remove" data-tooltip={`Remover ${member.name}`} aria-label={`Remover ${member.name}`} type="button" onClick={onRemove}><UserMinus size={14} /></button>}<i data-online={online} /></div></div>;
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
