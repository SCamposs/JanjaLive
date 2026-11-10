import { type RefObject } from "react";
import { Dialog } from "@janjalive/ui/dialog";
import { AppWindow } from "lucide-react";
import { ChoiceGroup } from "@janjalive/ui";
import type { NativeAudioMode } from "../../shared/contracts";

export type Resolution = "720p" | "1080p" | "1440p" | "source";
export type Quality = "auto" | "high" | "custom";
type Props = {
  previewRef: RefObject<HTMLVideoElement | null>;
  deferred: boolean;
  busy: boolean;
  name: string;
  audioMode: NativeAudioMode | "unavailable";
  resolution: Resolution;
  fps: 30 | 60;
  quality: Quality;
  customBitrate: number;
  onResolution(value: Resolution): void;
  onFps(value: 30 | 60): void;
  onQuality(value: Quality): void;
  onCustomBitrate(value: number): void;
  onCancel(): void;
  onStart(): Promise<void>;
};

export function CaptureConfig({ previewRef, deferred, busy, name, audioMode, resolution, fps, quality, customBitrate, onResolution, onFps, onQuality, onCustomBitrate, onCancel, onStart }: Props) {

  const audioLabel = audioMode === "application" ? "Áudio da aplicação"
    : audioMode === "system-excluding-application" ? "Áudio do sistema · Aplicação excluída"
      : audioMode === "system" ? "Áudio do sistema"
        : audioMode === "unavailable" ? "Áudio indisponível — somente vídeo" : "Somente vídeo";
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}><Dialog.Portal><div className="modal-backdrop">
    <Dialog.Popup render={<section />} className="capture-panel capture-modal" aria-label="Configurar transmissão" aria-busy={busy}>
      {deferred ? <div className="capture-deferred-preview"><AppWindow size={32} aria-hidden="true" /><strong>{name}</strong><span>{busy ? "Iniciando transmissão…" : "A aplicação será restaurada ao compartilhar."}</span></div>
        : <video ref={previewRef} autoPlay muted playsInline />}
      <div className="capture-title"><strong>{name}</strong><span>{audioLabel}</span></div>
      <div className="capture-settings">
        <OptionGroup disabled={busy} label="Resolução" value={resolution} values={["720p", "1080p", "1440p", "source"]} labels={{ source: "Fonte" }} onChange={(value) => onResolution(value as Resolution)} />
        <OptionGroup disabled={busy} label="FPS" value={String(fps)} values={["30", "60"]} onChange={(value) => onFps(value === "60" ? 60 : 30)} />
        <div><OptionGroup disabled={busy} label="Qualidade" value={quality} values={["auto", "high", "custom"]} labels={{ auto: "Auto", high: "Alta", custom: "Personalizada" }} onChange={(value) => onQuality(value as Quality)} />
          {quality === "custom" && <label className="custom-bitrate"><span>Mbps</span><input disabled={busy} type="number" min="2" max="25" value={customBitrate} onChange={(event) => onCustomBitrate(Number(event.target.value))} /></label>}
        </div>
        <div className="capture-actions"><button className="quiet-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" type="button" disabled={busy} onClick={() => void onStart()}>{busy ? "Iniciando…" : "Compartilhar"}</button></div>
      </div>
    </Dialog.Popup>
  </div></Dialog.Portal></Dialog.Root>;
}

function OptionGroup({ label, value, values, labels = {}, onChange, disabled }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange(value: string): void; disabled: boolean }) {
  return <fieldset disabled={disabled}><legend>{label}</legend><ChoiceGroup label={label} className="options" value={value} onValueChange={onChange} options={values.map((option) => ({ value: option, label: labels[option] ?? option }))} /></fieldset>;
}
