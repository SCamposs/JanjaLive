import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthStatus, CaptureSource, UpdaterStatus } from "../../shared/contracts";

type Resolution = "720p" | "1080p" | "1440p" | "source";
type Quality = "auto" | "high" | "custom";

export function App() {
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const [captureName, setCaptureName] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<Quality>("auto");
  const [systemAudio, setSystemAudio] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("0.1.0");
  const [update, setUpdate] = useState<UpdaterStatus>({ state: "idle" });
  const [auth, setAuth] = useState<AuthStatus>({ state: "signed-out" });
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    void window.janja.app.getVersion().then(setVersion);
    void window.janja.updater.getStatus().then(setUpdate);
    void window.janja.auth.getStatus().then(setAuth);
    const removeUpdaterListener = window.janja.updater.onStatus(setUpdate);
    const removeAuthListener = window.janja.auth.onStatus(setAuth);
    return () => { removeUpdaterListener(); removeAuthListener(); };
  }, []);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = capture;
  }, [capture]);

  useEffect(() => () => capture?.getTracks().forEach((track) => track.stop()), [capture]);

  const groupedSources = useMemo(() => ({
    windows: sources?.filter((source) => source.kind === "window") ?? [],
    screens: sources?.filter((source) => source.kind === "screen") ?? [],
  }), [sources]);

  async function openPicker() {
    setError(null);
    setSources(await window.janja.capture.listSources());
  }

  async function selectSource(source: CaptureSource) {
    setError(null);
    try {
      await window.janja.capture.selectSource({ token: source.token, withSystemAudio: systemAudio });
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setCapture(stream);
      setCaptureName(source.name);
      setSources(null);
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, { once: true });
    } catch {
      await window.janja.capture.cancelSelection();
      setError("Não foi possível capturar essa fonte. Escolha novamente.");
    }
  }

  function stopCapture() {
    capture?.getTracks().forEach((track) => track.stop());
    setCapture(null);
    setSharing(false);
  }

  return (
    <main className="desktop-shell">
      <header className="app-header">
        <div className="brand"><img src="/janja-live.png" alt="" /><span>JanjaLive</span></div>
        <div className="header-actions">
          <span className="version">v{version}</span>
          <button className="quiet-button" type="button" onClick={() => void window.janja.updater.check()}>
            {update.state === "checking" ? "Verificando…" : "Buscar atualização"}
          </button>
          {auth.state === "signed-in" ? (
            <button className="account-button" type="button" onClick={() => void window.janja.auth.logout()}>
              {auth.user.image && <img src={auth.user.image} alt="" />}
              <span>{auth.user.name}</span>
              <small>Sair</small>
            </button>
          ) : (
            <button className="account-button" type="button" disabled={auth.state === "connecting"} onClick={() => void window.janja.auth.start()}>
              {auth.state === "connecting" ? "Conectando…" : "Entrar com Discord"}
            </button>
          )}
        </div>
      </header>

      {update.state === "ready" && (
        <aside className="update-bar"><span>JanjaLive v{update.version} está pronto.</span><button type="button" onClick={() => void window.janja.updater.restartAndInstall()}>Reiniciar e atualizar</button></aside>
      )}

      <section className="desktop-content">
        <div className="room-placeholder">
          <p className="eyebrow">Desktop</p>
          <h1>{sharing ? "Compartilhando" : "Compartilhe sua tela"}</h1>
          <p>{sharing ? captureName : "Escolha uma aplicação ou tela sem sair do JanjaLive."}</p>
          {!capture && <button className="primary-button" type="button" onClick={() => void openPicker()}>Escolher tela</button>}
        </div>

        {capture && (
          <section className="capture-panel">
            <video ref={previewRef} autoPlay muted playsInline />
            <div className="capture-title"><strong>{captureName}</strong><span>{capture.getAudioTracks().length ? "Áudio do sistema" : "Sem áudio"}</span></div>
            {!sharing ? (
              <div className="capture-settings">
                <OptionGroup label="Resolução" value={resolution} values={["720p", "1080p", "1440p", "source"]} labels={{ source: "Fonte" }} onChange={(value) => setResolution(value as Resolution)} />
                <OptionGroup label="FPS" value={String(fps)} values={["30", "60"]} onChange={(value) => setFps(value === "60" ? 60 : 30)} />
                <OptionGroup label="Qualidade" value={quality} values={["auto", "high", "custom"]} labels={{ auto: "Auto", high: "Alta", custom: "Personalizada" }} onChange={(value) => setQuality(value as Quality)} />
                <div className="capture-actions"><button className="quiet-button" type="button" onClick={stopCapture}>Cancelar</button><button className="primary-button" type="button" onClick={() => setSharing(true)}>Compartilhar</button></div>
              </div>
            ) : <button className="stop-button" type="button" onClick={stopCapture}>Encerrar transmissão</button>}
          </section>
        )}
      </section>

      {sources && (
        <div className="modal-backdrop" role="presentation">
          <section className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-title">
            <header><div><h2 id="source-title">Compartilhe sua tela</h2><p>Escolha uma aplicação ou monitor.</p></div><button type="button" onClick={() => { setSources(null); void window.janja.capture.cancelSelection(); }} aria-label="Fechar">×</button></header>
            <label className="audio-toggle"><input type="checkbox" checked={systemAudio} onChange={(event) => setSystemAudio(event.target.checked)} /><span>Áudio do sistema</span></label>
            <SourceGroup title="Aplicações" sources={groupedSources.windows} onSelect={selectSource} />
            <SourceGroup title="Telas" sources={groupedSources.screens} onSelect={selectSource} />
          </section>
        </div>
      )}

      {error && <div className="error-toast" role="alert">{error}<button type="button" onClick={() => setError(null)}>×</button></div>}
      {auth.state === "error" && <div className="error-toast" role="alert">{auth.message}<button type="button" onClick={() => setAuth({ state: "signed-out" })}>×</button></div>}
    </main>
  );
}

function SourceGroup({ title, sources, onSelect }: { title: string; sources: CaptureSource[]; onSelect: (source: CaptureSource) => void }) {
  if (!sources.length) return null;
  return <section className="source-group"><h3>{title}</h3><div className="source-grid">{sources.map((source) => <button type="button" key={source.token} onClick={() => void onSelect(source)}><img src={source.thumbnailDataUrl} alt="" /><span>{source.name}</span></button>)}</div></section>;
}

function OptionGroup({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <fieldset><legend>{label}</legend><div className="options">{values.map((option) => <button type="button" data-active={value === option} key={option} onClick={() => onChange(option)}>{labels[option] ?? option}</button>)}</div></fieldset>;
}
