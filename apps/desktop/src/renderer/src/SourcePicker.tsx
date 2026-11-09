import { useEffect, useRef } from "react";
import { AppWindow, Monitor } from "lucide-react";
import type { CaptureSource } from "../../shared/contracts";

type Props = {
  sources: { windows: CaptureSource[]; screens: CaptureSource[] };
  audioEnabled: boolean;
  onAudioEnabled: (value: boolean) => void;
  excludedAudioSource: string | null;
  onExcludedAudioSource: (value: string | null) => void;
  onSelect: (source: CaptureSource) => Promise<void>;
  onClose: () => void;
  selecting: CaptureSource | null;
};

export function SourcePicker({ sources, audioEnabled, onAudioEnabled, excludedAudioSource, onExcludedAudioSource, onSelect, onClose, selecting }: Props) {
  const busy = Boolean(selecting);
  const dialog = useRef<HTMLElement | null>(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  return <div className="modal-backdrop" role="presentation"><section className="source-dialog" role="dialog" ref={dialog} tabIndex={-1} aria-modal="true" aria-labelledby="source-title" aria-busy={busy}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><div><h2 id="source-title">Compartilhe sua tela</h2><p>Escolha uma aplicação ou monitor.</p></div><button type="button" data-busy={busy} onClick={onClose} aria-label={busy ? "Cancelar seleção" : "Fechar"}>{busy ? "Cancelar" : "×"}</button></header>
    <label className="audio-toggle"><input type="checkbox" checked={audioEnabled} disabled={busy} onChange={(event) => onAudioEnabled(event.target.checked)} /><span><strong>Incluir áudio</strong><small>{audioEnabled ? "Áudio da aplicação em janelas · Áudio do sistema em telas" : "Somente vídeo"}</small></span></label>
    {selecting && <div className="capture-wait" role="status"><span className="capture-wait-dot" aria-hidden="true" /><div><strong>{selecting.minimized ? `Restaurando ${selecting.name}…` : "Preparando captura…"}</strong>{selecting.minimized && <small>Se necessário, volte à aplicação para iniciar.</small>}</div></div>}
    <SourceGroup title="Aplicações" sources={sources.windows} onSelect={onSelect} disabled={busy} />
    {audioEnabled && sources.screens.length > 0 && sources.windows.length > 0 && <details className="audio-exclusion"><summary>{excludedAudioSource ? `Sem áudio de: ${sources.windows.find((item) => item.token === excludedAudioSource)?.name}` : "Excluir áudio de uma aplicação"}</summary><p>Ao compartilhar um monitor, escolha o Discord ou outra aplicação para deixar fora do áudio.</p><div className="audio-exclusion-options"><button type="button" disabled={busy} aria-pressed={!excludedAudioSource} onClick={() => onExcludedAudioSource(null)}>Incluir todas</button>{sources.windows.map((source) => <button type="button" disabled={busy} key={source.token} aria-pressed={excludedAudioSource === source.token} onClick={() => onExcludedAudioSource(source.token)}>{source.name}</button>)}</div></details>}
    <SourceGroup title="Telas" sources={sources.screens} onSelect={onSelect} disabled={busy} />
  </section></div>;
}

function SourceGroup({ title, sources, onSelect, disabled }: { title: string; sources: CaptureSource[]; onSelect: Props["onSelect"]; disabled: boolean }) {
  if (!sources.length) return null;
  return <section className="source-group"><h3>{title}</h3><div className="source-grid">{sources.map((source) => <button type="button" key={source.token} disabled={disabled} onClick={() => void onSelect(source)}>
    {source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <div className="source-placeholder" aria-hidden="true">{source.kind === "window" ? <AppWindow size={32} /> : <Monitor size={32} />}</div>}
    <span>{source.name}{source.minimized && <small className="source-minimized">Minimizada</small>}</span>
  </button>)}</div></section>;
}
