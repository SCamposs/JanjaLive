import { DesktopAccessGate as AccessGate } from "./DesktopAccessGate";
import { DesktopDeleteRoomAction } from "./DesktopDeleteRoomAction";
import { subscribeAuthStatus } from "./auth-session";
import { DesktopLogin } from "./DesktopLogin";
import { DesktopNoirBackdrop } from "./DesktopNoirBackdrop";
import { DesktopRoomList } from "./DesktopRoomList";
import { DesktopAccountMenu } from "./DesktopAccountMenu";
import { ChoiceGroup, TooltipButton, usePlayerControlsAutoHide } from "@janjalive/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleStop, Copy, LogOut, Maximize, Minimize2, PictureInPicture2, Play, Scaling, UserMinus, UsersRound, Volume2, VolumeX, X } from "lucide-react";
import { playRoomCue, type ConnectionStatus, type StreamMetadata } from "@janjalive/webrtc";
import type { AuthStatus, CaptureSource, NativeAudioMode, RoomSnapshot, RoomSummary, UpdaterStatus } from "../../shared/contracts";
import { SourcePicker } from "./SourcePicker";
import { acquireCapture } from "./capture-selection";
import { useRoomMedia } from "./use-room-media";
import { startNativeAudioCapture, type NativeAudioCapture } from "./native-audio";

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


export function App() {
  const [auth, setAuth] = useState<AuthStatus>({ state: "checking" });
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [selectingSource, setSelectingSource] = useState<CaptureSource | null>(null);
  const captureSelectionRef = useRef<AbortController | null>(null);
  const pickerRequestRef = useRef(0);
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [captureName, setCaptureName] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<Quality>("auto");
  const [customBitrate, setCustomBitrate] = useState(10);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [excludedAudioSource, setExcludedAudioSource] = useState<string | null>(null);
  const [captureAudioMode, setCaptureAudioMode] = useState<NativeAudioMode | "unavailable">("none");
  const [sharing, setSharing] = useState(false);
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("0.1.0");
  const [update, setUpdate] = useState<UpdaterStatus>({ state: "idle" });
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const authRef = useRef<AuthStatus>(auth);
  const pendingInviteRef = useRef<string | null>(null);
  const knownStreamsRef = useRef<Set<string> | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const pendingCaptureRef = useRef<MediaStream | null>(null);
  const pendingNativeAudioRef = useRef<NativeAudioCapture | null>(null);
  const broadcastNativeAudioRef = useRef<NativeAudioCapture | null>(null);
  const authorizedRoomId = room?.access === "authorized" ? room.room.id : null;
  const realtime = useRoomMedia(authorizedRoomId);

  const releaseCapture = useCallback(() => {
    activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    pendingCaptureRef.current?.getTracks().forEach((track) => track.stop());
    activeStreamRef.current = null;
    pendingCaptureRef.current = null;
    void pendingNativeAudioRef.current?.stop();
    void broadcastNativeAudioRef.current?.stop();
    pendingNativeAudioRef.current = null;
    broadcastNativeAudioRef.current = null;
    setCapture(null);
    setLocalStream(null);
    setSharing(false);
    setCaptureAudioMode("none");
  }, []);

  useEffect(() => () => { releaseCapture(); }, [authorizedRoomId, releaseCapture]);

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
    const removeUpdater = window.janja.updater.onStatus(handleUpdateStatus);
    const removeAuth = subscribeAuthStatus(window.janja.auth, handleAuthStatus);
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
      releaseCapture();
      setSelectedStreamers([]);
      setRoom(null);
      void refreshRooms();
    }, 0);
    return () => clearTimeout(timeout);
  }, [realtime.roomUnavailable, refreshRooms, releaseCapture]);

  useEffect(() => {
    if (!authorizedRoomId) return;
    let cancelled = false;
    void window.janja.rooms.get(authorizedRoomId).then((next) => {
      if (!cancelled) setRoom(next);
    }).catch((error: unknown) => {
      if (!cancelled && /API_(403|404)/.test(String(error))) {
        releaseCapture();
        setSelectedStreamers([]);
        setRoom(null);
        void refreshRooms();
      }
    });
    return () => { cancelled = true; };
  }, [authorizedRoomId, realtime.membershipRevision, realtime.onlineUserIds, releaseCapture, refreshRooms]);

  const groupedSources = useMemo(() => ({
    windows: sources?.filter((source) => source.kind === "window") ?? [],
    screens: sources?.filter((source) => source.kind === "screen") ?? [],
  }), [sources]);

  const closePicker = useCallback(() => {
    pickerRequestRef.current++;
    captureSelectionRef.current?.abort();
    captureSelectionRef.current = null;
    setSelectingSource(null);
    setSources(null);
    void window.janja.capture.cancelSelection();
  }, []);

  useEffect(() => () => {
    if (captureSelectionRef.current) closePicker();
  }, [authorizedRoomId, closePicker]);

  async function openPicker() {
    const request = ++pickerRequestRef.current;
    setError(null);
    try {
      setExcludedAudioSource(null);
      const available = await window.janja.capture.listSources();
      if (pickerRequestRef.current === request) setSources(available);
    } catch {
      if (pickerRequestRef.current !== request) return;
      setError("Não foi possível listar as telas e aplicações.");
    }
  }

  async function selectSource(source: CaptureSource) {
    if (captureSelectionRef.current) return;
    const attempt = new AbortController();
    captureSelectionRef.current = attempt;
    setSelectingSource(source);
    setError(null);
    const audioMode: NativeAudioMode = audioEnabled
      ? source.kind === "window" ? "application" : excludedAudioSource ? "system-excluding-application" : "system"
      : "none";
    let stream: MediaStream | null = null;
    let acquiredAudio: NativeAudioCapture | null = null;
    try {
      stream = await acquireCapture(() => window.janja.capture.selectSource({ token: source.token, audioMode,
        ...(audioMode === "system-excluding-application" && excludedAudioSource ? { excludedSourceToken: excludedAudioSource } : {}),
      }), () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }), attempt.signal);
      const previousAudio = pendingNativeAudioRef.current;
      pendingNativeAudioRef.current = null;
      await previousAudio?.stop();
      attempt.signal.throwIfAborted();

      if (audioMode !== "none") {
        const nativeAudio = await startNativeAudioCapture(stream, () => {
          setCaptureAudioMode("unavailable");
          setError("O áudio ficou indisponível. A transmissão continua somente com vídeo.");
        });
        acquiredAudio = nativeAudio;
        attempt.signal.throwIfAborted();
        pendingNativeAudioRef.current = nativeAudio;
        setCaptureAudioMode(nativeAudio?.mode ?? "unavailable");
      } else {
        setCaptureAudioMode("none");
      }
      await window.janja.capture.cancelSelection();
      attempt.signal.throwIfAborted();
      if (!stream.getVideoTracks().some((track) => track.readyState === "live")) throw new Error("CAPTURE_WINDOW_CHANGED");
      pendingCaptureRef.current = stream;
      setCapture(stream);
      setCaptureName(source.name);
      setSources(null);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (pendingCaptureRef.current === stream) {
          pendingCaptureRef.current = null;
          void pendingNativeAudioRef.current?.stop();
          pendingNativeAudioRef.current = null;
          setCapture(null);
          setCaptureAudioMode("none");
          return;
        }
        if (activeStreamRef.current !== stream) return;
        activeStreamRef.current = null;
        void broadcastNativeAudioRef.current?.stop();
        broadcastNativeAudioRef.current = null;
        void realtime.stopBroadcast();
        setCapture(null);
        setLocalStream(null);
        setSharing(false);
        setSelectedStreamers((ids) => ids.filter((id) => auth.state !== "signed-in" || id !== auth.user.id));
      }, { once: true });
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      await acquiredAudio?.stop();
      if (attempt.signal.aborted || captureSelectionRef.current !== attempt) return;
      pendingCaptureRef.current = null;
      if (pendingNativeAudioRef.current === acquiredAudio) pendingNativeAudioRef.current = null;
      await window.janja.capture.cancelSelection();
      if (attempt.signal.aborted || captureSelectionRef.current !== attempt) return;
      const reason = error instanceof Error ? error.message : "";
      setError(reason.includes("CAPTURE_WINDOW_NOT_READY")
        ? "A aplicação ainda não está pronta. Volte a ela e tente compartilhar novamente."
        : reason.includes("CAPTURE_WINDOW_CHANGED") ? "Essa janela foi fechada ou mudou. Escolha a aplicação novamente."
          : "Não foi possível capturar essa fonte. Escolha novamente.");
    } finally {
      if (captureSelectionRef.current === attempt) {
        captureSelectionRef.current = null;
        setSelectingSource(null);
      }
    }
  }

  function cancelCapture() {
    pendingCaptureRef.current = null;
    capture?.getTracks().forEach((track) => track.stop());
    void pendingNativeAudioRef.current?.stop();
    pendingNativeAudioRef.current = null;
    setCapture(null);
    setCaptureAudioMode("none");
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
    const previousStream = localStream;
    const previousAudio = broadcastNativeAudioRef.current;
    const nextAudio = pendingNativeAudioRef.current;
    if (sharing) await realtime.replaceBroadcast(capture, metadata, bitrate);
    else {
      await realtime.startBroadcast(capture, metadata, bitrate);
      await playRoomCue("stream-start", true);
    }
    setLocalStream(capture);
    activeStreamRef.current = capture;
    pendingCaptureRef.current = null;
    pendingNativeAudioRef.current = null;
    broadcastNativeAudioRef.current = nextAudio;
    setCapture(null);
    setSharing(true);
    setSelectedStreamers((ids) => ids.includes(auth.user.id) ? ids : [...ids, auth.user.id]);
    if (previousStream && previousStream !== capture) previousStream.getTracks().forEach((track) => track.stop());
    if (previousAudio && previousAudio !== nextAudio) await previousAudio.stop();
  }

  async function stopSharing() {
    releaseCapture();
    if (sharing) await realtime.stopBroadcast();
    if (auth.state === "signed-in") setSelectedStreamers((ids) => ids.filter((id) => id !== auth.user.id));
  }

  function leaveRoom() {
    closePicker();
    if (sharing || capture) void stopSharing();
    selectedStreamers.forEach((id) => { void realtime.stopWatching(id); });
    setSelectedStreamers([]);
    setRoom(null);
    void refreshRooms();
  }

  async function logout() {
    if (sharing || capture) return;
    await Promise.all(selectedStreamers.map((id) => realtime.stopWatching(id).catch(() => undefined)));
    setSelectedStreamers([]);
    setRoom(null);
    await window.janja.auth.logout();
  }

  const activeRemoteStreams = realtime.activeStreams.filter((stream) => auth.state !== "signed-in" || stream.streamerUserId !== auth.user.id);
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

  useEffect(() => {
    const ended = selectedStreamers.filter((id) => id !== signedInUserId && !realtime.activeStreams.some((stream) => stream.streamerUserId === id));
    if (!ended.length) return;
    const timeout = window.setTimeout(() => {
      ended.forEach((id) => { void stopWatching(id); });
      setSelectedStreamers((ids) => ids.filter((id) => !ended.includes(id)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [realtime.activeStreams, selectedStreamers, signedInUserId, stopWatching]);

  return (
    <main className="desktop-shell">
      <Header auth={auth} version={version} update={update} inRoom={Boolean(room)} canLogout={!sharing && !capture && !selectingSource} onLeaveRoom={leaveRoom} onLogout={logout} onShowUpdate={() => setUpdateDialogOpen(true)} />

      {update.state === "required" && <aside className="update-bar required"><span>Esta versão precisa ser atualizada para continuar.</span><button type="button" onClick={() => void window.janja.updater.check()}>Verificar atualização</button></aside>}
      {update.state === "store" && update.required && <aside className="update-bar required"><span>Atualize o JanjaLive pela Microsoft Store para continuar.</span><button type="button" onClick={() => void window.janja.updater.check()}>Abrir Microsoft Store</button></aside>}

      {auth.state !== "signed-in" ? <DesktopLogin auth={auth} /> : room ? (
        room.access === "authorized" ? <RoomView room={room} currentUserId={auth.user.id} sharing={sharing} localStream={localStream} selectedStreamers={selectedStreamers} remoteStreams={realtime.remoteStreams} activeStreams={activeRemoteStreams} onlineUserIds={realtime.onlineUserIds} viewerUserIds={realtime.viewerUserIds} connectionStatus={realtime.connectionStatus} onRoomUpdate={setRoom} onRoomDeleted={leaveRoom} onShare={openPicker} onStopSharing={stopSharing} onSelectStreamer={(userId) => void watchStreamer(userId)} onStopWatching={(userId) => void leaveStream(userId)} />
        : <AccessGate room={room} onUpdate={setRoom} onRequest={async () => { await window.janja.rooms.requestAccess(room.room.id); setRoom({ ...room, access: "pending" }); }} />
      ) : <Home rooms={rooms} onOpen={async (roomId) => setRoom(await window.janja.rooms.get(roomId))} onOpenSnapshot={setRoom} onRefresh={refreshRooms} />}

      {capture && <CaptureConfig previewRef={previewRef} name={captureName} audioMode={captureAudioMode} resolution={resolution} fps={fps} quality={quality} customBitrate={customBitrate} onResolution={setResolution} onFps={setFps} onQuality={setQuality} onCustomBitrate={setCustomBitrate} onCancel={cancelCapture} onStart={startSharing} />}

      {sources && <SourcePicker sources={groupedSources} audioEnabled={audioEnabled} onAudioEnabled={setAudioEnabled} excludedAudioSource={excludedAudioSource} onExcludedAudioSource={setExcludedAudioSource} onSelect={selectSource} selecting={selectingSource} onClose={closePicker} />}

      {update.state === "ready" && updateDialogOpen && <UpdateDialog version={update.version} onClose={() => setUpdateDialogOpen(false)} />}

      {(error || auth.state === "error" || realtime.connectionError) && <div className="error-toast" role="alert">{error || (auth.state === "error" ? auth.message : realtime.connectionError)}<button type="button" aria-label="Fechar aviso" onClick={() => { setError(null); realtime.dismissConnectionError(); if (auth.state === "error") setAuth({ state: "signed-out" }); }}>×</button></div>}
    </main>
  );
}

function UpdateDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function installUpdate() {
    setInstallError(false);
    setInstalling(true);
    try {
      await window.janja.updater.restartAndInstall();
    } catch {
      setInstalling(false);
      setInstallError(true);
    }
  }
  return (
    <dialog
      ref={ref}
      className="update-dialog"
      data-installing={installing}
      aria-labelledby="update-dialog-title"
      onCancel={(event) => { if (installing) event.preventDefault(); else onClose(); }}
    >
      {installing ? (
        <div className="update-installing" aria-live="polite">
          <img src="/janja-live.png" alt="" />
          <h2 id="update-dialog-title">Aplicando atualização</h2>
          <p>O JanjaLive será reaberto em instantes.</p>
          <div className="update-install-progress" role="progressbar" aria-label="Aplicando atualização"><span /></div>
        </div>
      ) : (
        <>
          <h2 id="update-dialog-title">Atualizar JanjaLive?</h2>
          <p>A versão {version} já foi baixada. O aplicativo será reiniciado para concluir a instalação.</p>
          {installError && <p className="update-install-error" role="alert">Não foi possível iniciar a atualização. Tente novamente.</p>}
          <div className="update-dialog-actions">
            <button className="quiet-button" type="button" onClick={onClose}>Agora não</button>
            <button className="primary-button" type="button" onClick={() => void installUpdate()}>Atualizar e reiniciar</button>
          </div>
        </>
      )}
    </dialog>
  );
}

function Header({ auth, version, update, inRoom, canLogout, onLeaveRoom, onLogout, onShowUpdate }: { auth: AuthStatus; version: string; update: UpdaterStatus; inRoom: boolean; canLogout: boolean; onLeaveRoom: () => void; onLogout: () => Promise<void>; onShowUpdate: () => void }) {
  return <header className="app-header"><div className="brand"><img src="/janja-live.png" alt="" /><span>JanjaLive</span></div><div className="header-actions">{inRoom && <TooltipButton className="header-icon-action" tooltip="Sair da sala" tooltipSide="bottom" aria-label="Sair da sala" type="button" onClick={onLeaveRoom}><LogOut size={17} /></TooltipButton>}<span className="version">v{version}</span>{update.state === "checking" && <span className="update-checking" role="status" aria-label="Verificando atualização" />}{update.state === "ready" && <button className="update-indicator" type="button" onClick={onShowUpdate}><span />Nova versão</button>}{auth.state === "signed-in" && <DesktopAccountMenu user={auth.user} canLogout={canLogout} onLogout={onLogout} onSafety={() => void window.janja.app.openSafety()} />}</div></header>;
}


function Home({ rooms, onOpen, onOpenSnapshot, onRefresh }: { rooms: RoomSummary[]; onOpen: (id: string) => Promise<void>; onOpenSnapshot: (room: RoomSnapshot) => void; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  async function createRoom() {
    setBusy(true);
    setCreateError(null);
    try { onOpenSnapshot(await window.janja.rooms.create({ name: name || undefined, accessMode: "APPROVAL" })); }
    catch { setCreateError("Não foi possível criar a sala. Se atingiu o limite, encerre uma sala ativa ou tente mais tarde."); }
    finally { setBusy(false); }
  }
  async function joinCode(roomCode: string) { if (busy || !/^[2-9A-HJ-NP-Z]{7}$/.test(roomCode)) return; setBusy(true); try { onOpenSnapshot(await window.janja.rooms.joinCode(roomCode)); } finally { setBusy(false); void onRefresh(); } }
  function updateCode(value: string) {
    const nextCode = normalizeRoomCode(value);
    setCode(nextCode);
    if (nextCode.length === ROOM_CODE_LENGTH) void joinCode(nextCode);
  }
  return <section className="desktop-home desktop-noir-screen">
    <DesktopNoirBackdrop />
    <div className="home-heading"><h1>Salas</h1><p>Crie uma sala ou entre com um código.</p></div>
    <div className="desktop-room-grid">
      <DesktopRoomList rooms={rooms} onOpen={onOpen} onRefresh={onRefresh} />
      <section className="new-room-card">
        <h2>Nova sala</h2>
        {createError && <p role="alert">{createError}</p>}
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

function RoomView({ room, currentUserId, sharing, localStream, selectedStreamers, remoteStreams, activeStreams, onlineUserIds, viewerUserIds, connectionStatus, onRoomUpdate, onRoomDeleted, onShare, onStopSharing, onSelectStreamer, onStopWatching }: { room: RoomSnapshot; currentUserId: string; sharing: boolean; localStream: MediaStream | null; selectedStreamers: string[]; remoteStreams: Record<string, MediaStream>; activeStreams: Array<{ streamerUserId: string; preset: string; hasAudio: boolean }>; onlineUserIds: string[]; viewerUserIds: string[]; connectionStatus: ConnectionStatus; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void; onShare: () => Promise<void>; onStopSharing: () => Promise<void>; onSelectStreamer: (id: string) => void; onStopWatching: (userId: string) => void }) {
  const members = new Map(room.members.map((member) => [member.userId, member]));
  const [codeCopied, setCodeCopied] = useState(false);
  async function copyRoomCode() {
    await window.janja.rooms.copyCode(room.room.code);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1_800);
  }
  return <div className="desktop-room-layout"><section className="desktop-stage-column"><div className="room-heading"><div className="room-heading-identity"><h1>{room.room.name}</h1><button className="room-code-display" type="button" onClick={() => void copyRoomCode()} aria-label={`Copiar código da sala ${room.room.code}`}><span>{codeCopied ? "Copiado" : "Código"}</span><strong>{room.room.code}</strong></button>{connectionStatus !== "good" && <span className={`connection-warning ${connectionStatus}`}>{connectionStatus === "unstable" ? "Conexão instável" : connectionStatus === "connecting" ? "Conectando…" : "Reconectando…"}</span>}</div>{sharing ? <button className="quiet-button" type="button" onClick={() => void onShare()}>Trocar tela</button> : <button className="primary-button" type="button" onClick={() => void onShare()}>Compartilhar tela</button>}</div><div className="desktop-stage">{selectedStreamers.length ? <div className="multilive-grid" data-multiple={selectedStreamers.length > 1}>{selectedStreamers.map((id, index) => {
    const own = id === currentUserId;
    const stream = own ? localStream : remoteStreams[id];
    return <div className="multilive-tile" key={id}>{stream ? <Player stream={stream} label={own ? "Sua transmissão" : members.get(id)?.name ?? "Transmissão"} own={own} initiallyMuted={own || index > 0} viewerNames={own ? viewerUserIds.map((viewerId) => members.get(viewerId)?.name ?? "Membro") : undefined} onStop={() => own ? void onStopSharing() : onStopWatching(id)} /> : <div className="desktop-stream-connecting"><span>Conectando a {members.get(id)?.name ?? "transmissão"}…</span><button type="button" className="quiet-button" onClick={() => onStopWatching(id)}>Cancelar</button></div>}</div>;
  })}</div> : activeStreams.length ? <div className="desktop-stream-list"><div className="desktop-stream-heading"><h2>Transmissões</h2><span>{activeStreams.length} {activeStreams.length === 1 ? "disponível" : "disponíveis"}</span></div>{activeStreams.map((item) => {
    const member = members.get(item.streamerUserId);
    const name = member?.name ?? "Amigo";
    return <button type="button" key={item.streamerUserId} onClick={() => onSelectStreamer(item.streamerUserId)}>{member?.image ? <img src={member.image} alt="" /> : <span className="stream-avatar-fallback">{name[0]}</span>}<span><strong>{name}</strong><small><b>AO VIVO</b> {item.preset.replace(/(\d+p)(\d+)/, "$1 · $2 FPS")}{item.hasAudio ? " · Áudio" : ""}</small></span><span className="watch-action">Assistir</span></button>;
  })}</div> : <div className="empty-room"><DesktopNoirBackdrop image="/janja-live-noir-2.png" /><div className="empty-room-copy"><h2>Nenhuma transmissão ativa</h2><p>Compartilhe sua tela ou aguarde um amigo começar.</p></div></div>}</div></section><RoomMembers room={room} onlineUserIds={onlineUserIds} currentUserId={currentUserId} activeStreamerIds={new Set(activeStreams.map((item) => item.streamerUserId))} selectedStreamers={selectedStreamers} onWatch={onSelectStreamer} onRoomUpdate={onRoomUpdate} onRoomDeleted={onRoomDeleted} /></div>;
}


function RoomMembers({ room, onlineUserIds, currentUserId, activeStreamerIds, selectedStreamers, onWatch, onRoomUpdate, onRoomDeleted }: { room: RoomSnapshot; onlineUserIds: string[]; currentUserId: string; activeStreamerIds: Set<string>; selectedStreamers: string[]; onWatch: (userId: string) => void; onRoomUpdate: (room: RoomSnapshot) => void; onRoomDeleted: () => void }) {
  const [copied, setCopied] = useState(false);
  async function manage(userId: string, action: "approve" | "reject" | "revoke") {
    onRoomUpdate(await window.janja.rooms.manageMember(room.room.id, { userId, action }));
  }
  async function copyInvite() {
    await window.janja.rooms.copyInvite(room.room.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }
  const online = room.members.filter((member) => onlineUserIds.includes(member.userId));
  return <aside className="desktop-members"><h2>Membros <span>{room.members.length}</span></h2>{room.pending.length > 0 && <section className="member-section pending-members"><h3>Pedidos</h3>{room.pending.map((member) => <div className="pending-member" key={member.userId}><Member member={{ ...member, role: "MEMBER" }} online={false} /><div><TooltipButton tooltip={`Aprovar ${member.name}`} aria-label={`Aprovar ${member.name}`} type="button" onClick={() => void manage(member.userId, "approve")}><Check size={14} /></TooltipButton><TooltipButton tooltip={`Recusar ${member.name}`} aria-label={`Recusar ${member.name}`} type="button" onClick={() => void manage(member.userId, "reject")}><X size={14} /></TooltipButton></div></div>)}</section>}<section className="member-section"><h3>Online</h3>{online.length ? online.map((member) => <Member key={member.userId} member={member} online streaming={activeStreamerIds.has(member.userId)} selected={selectedStreamers.includes(member.userId)} onWatch={member.userId !== currentUserId ? () => onWatch(member.userId) : undefined} />) : <p className="members-empty">Ninguém online.</p>}</section><section className="member-section"><h3>Autorizados</h3>{room.members.map((member) => <Member key={member.userId} member={member} online={onlineUserIds.includes(member.userId)} streaming={activeStreamerIds.has(member.userId)} selected={selectedStreamers.includes(member.userId)} onWatch={member.userId !== currentUserId ? () => onWatch(member.userId) : undefined} onRemove={room.room.isOwner && member.userId !== currentUserId ? () => void manage(member.userId, "revoke") : undefined} />)}</section>{room.room.isOwner && <footer className="room-owner-actions"><TooltipButton tooltip={copied ? "Convite copiado" : "Copiar novo convite"} aria-label={copied ? "Convite copiado" : "Copiar novo convite"} type="button" onClick={() => void copyInvite()}>{copied ? <Check size={15} /> : <Copy size={15} />}</TooltipButton><DesktopDeleteRoomAction room={room.room} onDeleted={onRoomDeleted} /></footer>}</aside>;
}

function Player({ stream, label, own, onStop, initiallyMuted = own, viewerNames }: { stream: MediaStream; label: string; own: boolean; onStop: () => void; initiallyMuted?: boolean; viewerNames?: string[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(initiallyMuted);
  const initialMutedRef = useRef(initiallyMuted);
  const [volume, setVolume] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const { controlsVisible, showControls, containerProps, controlsProps } = usePlayerControlsAutoHide();
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = initialMutedRef.current;
    setMuted(initialMutedRef.current);
    setPlaying(false);
    setFitMode("contain");
    showControls();
    void video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => undefined);
    });
  }, [own, showControls, stream]);
  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  }
  return <div className="desktop-player" data-fit={fitMode} data-controls-visible={controlsVisible} ref={containerRef} {...containerProps}>{viewerNames && <AudienceBadge names={viewerNames} />}<video ref={ref} autoPlay muted={muted} playsInline onDoubleClick={() => void toggleFullscreen()} onPlaying={() => setPlaying(true)} onWaiting={() => setPlaying(false)} />{!playing && <div className="desktop-player-waiting">Conectando à transmissão…</div>}<div className="desktop-player-controls" data-player-controls {...controlsProps}><span>{label}</span><div className="player-actions"><TooltipButton className="icon-action" tooltip={muted ? "Ativar som" : "Silenciar"} aria-label={muted ? "Ativar som" : "Silenciar"} type="button" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</TooltipButton><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (ref.current) ref.current.volume = next; }} /><TooltipButton className="icon-action" tooltip={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} aria-label={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} type="button" onClick={() => setFitMode((value) => value === "contain" ? "cover" : "contain")}><Scaling size={16} /></TooltipButton><TooltipButton className="icon-action" tooltip="Picture in Picture" aria-label="Picture in Picture" type="button" onClick={() => void ref.current?.requestPictureInPicture?.()}><PictureInPicture2 size={16} /></TooltipButton><TooltipButton className="icon-action" tooltip={fullscreen ? "Sair da tela cheia" : "Tela cheia"} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16} /> : <Maximize size={16} />}</TooltipButton><TooltipButton className="icon-action danger-control" tooltip={own ? "Encerrar transmissão" : "Parar de assistir"} aria-label={own ? "Encerrar transmissão" : "Parar de assistir"} type="button" onClick={onStop}><CircleStop size={16} /></TooltipButton></div></div></div>;
}

function Member({ member, online, streaming = false, selected = false, onWatch, onRemove }: { member: RoomSnapshot["members"][number]; online: boolean; streaming?: boolean; selected?: boolean; onWatch?: () => void; onRemove?: () => void }) {
  return <div className="desktop-member">{member.image ? <img src={member.image} alt="" /> : <span>{member.name[0]}</span>}<div><strong>{member.name}</strong><small>{streaming ? `${member.role === "OWNER" ? "Dono · " : ""}Transmitindo` : member.role === "OWNER" ? "Dono" : online ? "Online" : "Offline"}</small></div><div className="member-end">{streaming && onWatch && <TooltipButton className="member-watch" tooltip={selected ? `Assistindo ${member.name}` : `Assistir ${member.name}`} aria-label={selected ? `Assistindo ${member.name}` : `Assistir ${member.name}`} disabled={selected} type="button" onClick={onWatch}><Play size={13} fill="currentColor" /></TooltipButton>}{onRemove && <TooltipButton className="member-remove" tooltip={`Remover ${member.name}`} aria-label={`Remover ${member.name}`} type="button" onClick={onRemove}><UserMinus size={14} /></TooltipButton>}<i data-online={online} /></div></div>;
}

function CaptureConfig({ previewRef, name, audioMode, resolution, fps, quality, customBitrate, onResolution, onFps, onQuality, onCustomBitrate, onCancel, onStart }: { previewRef: React.RefObject<HTMLVideoElement | null>; name: string; audioMode: NativeAudioMode | "unavailable"; resolution: Resolution; fps: 30 | 60; quality: Quality; customBitrate: number; onResolution: (value: Resolution) => void; onFps: (value: 30 | 60) => void; onQuality: (value: Quality) => void; onCustomBitrate: (value: number) => void; onCancel: () => void; onStart: () => Promise<void> }) {
  const audioLabel = audioMode === "application" ? "Áudio da aplicação" : audioMode === "system-excluding-application" ? "Áudio do sistema · Aplicação excluída" : audioMode === "system" ? "Áudio do sistema" : audioMode === "unavailable" ? "Áudio indisponível — somente vídeo" : "Somente vídeo";
  return <div className="modal-backdrop"><section className="capture-panel capture-modal"><video ref={previewRef} autoPlay muted playsInline /><div className="capture-title"><strong>{name}</strong><span>{audioLabel}</span></div><div className="capture-settings"><OptionGroup label="Resolução" value={resolution} values={["720p", "1080p", "1440p", "source"]} labels={{ source: "Fonte" }} onChange={(value) => onResolution(value as Resolution)} /><OptionGroup label="FPS" value={String(fps)} values={["30", "60"]} onChange={(value) => onFps(value === "60" ? 60 : 30)} /><div><OptionGroup label="Qualidade" value={quality} values={["auto", "high", "custom"]} labels={{ auto: "Auto", high: "Alta", custom: "Personalizada" }} onChange={(value) => onQuality(value as Quality)} />{quality === "custom" && <label className="custom-bitrate"><span>Mbps</span><input type="number" min="2" max="25" value={customBitrate} onChange={(event) => onCustomBitrate(Number(event.target.value))} /></label>}</div><div className="capture-actions"><button className="quiet-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" type="button" onClick={() => void onStart()}>Compartilhar</button></div></div></section></div>;
}

function OptionGroup({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <fieldset><legend>{label}</legend><ChoiceGroup label={label} className="options" value={value} onValueChange={onChange} options={values.map((option) => ({ value: option, label: labels[option] ?? option }))} /></fieldset>;
}

function AudienceBadge({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  return <div className="audience-badge" data-open={open} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-label={`${names.length} ${names.length === 1 ? "espectador" : "espectadores"}`} aria-expanded={open} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setOpen(true); }} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}><UsersRound size={14} /><span>{names.length}</span></button>
    <div className="audience-names"><strong>Assistindo agora</strong>{names.length ? <ul>{names.map((name, index) => <li key={index}>{name}</li>)}</ul> : <span>Ninguém assistindo</span>}</div>
  </div>;
}
