"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, MonitorUp, ShieldCheck, Volume2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChoiceGroup, useCapturePreferences } from "@janjalive/ui";
import {
  QUALITY_PROFILES,
  clampCustomBitrate,
  type QualityPreset,
} from "@/lib/quality";

type Props = {
  open: boolean;
  onCancel: () => void;
  onStart: (options: ScreenShareOptions) => Promise<boolean>;
};

export type ScreenShareOptions = {
  preset: QualityPreset;
  bitrate: number;
  frameRate: number;
};

const RESOLUTIONS = ["720p", "1080p", "1440p", "source"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

function toPreset(resolution: Resolution, frameRate: 30 | 60): QualityPreset {
  if (resolution === "source") return "source";
  return `${resolution}${frameRate}` as QualityPreset;
}

export function ScreenShareDialog({ open, onCancel, onStart }: Props) {
  const { resolution, setResolution, fps: frameRate, setFps: setFrameRate, quality, setQuality, customBitrate, setCustomBitrate } = useCapturePreferences();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const preset = toPreset(resolution, frameRate);
  const profile = QUALITY_PROFILES[preset];
  const bitrate = quality === "custom" ? clampCustomBitrate(customBitrate) : quality === "high" ? Math.min(25_000_000, profile.bitrate * 1.35) : profile.bitrate;

  const summary = useMemo(() => {
    const width = profile.width;
    const height = profile.height;
    const dimensions = width && height ? `${width}×${height}` : "Resolução original";
    return `${dimensions} · ${frameRate} FPS · ~${Math.round(bitrate / 1_000_000)} Mbps por pessoa`;
  }, [bitrate, frameRate, profile.height, profile.width]);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      await onStart({ preset, bitrate, frameRate });
    } catch {
      setStartError("Não foi possível abrir a seleção de tela. Tente novamente.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="share-dialog" aria-describedby="share-description">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>Compartilhar sua tela</Dialog.Title>
              <Dialog.Description id="share-description">
                Ajuste a qualidade. Depois de escolher a fonte no navegador, a transmissão começará automaticamente.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Fechar">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="share-source-step">
            <MonitorUp size={20} />
            <div><strong>Escolha na próxima etapa</strong><span>O navegador pedirá uma aba, janela ou tela.</span></div>
          </div>

          <div className="share-controls">
            <fieldset>
              <legend>Resolução</legend>
              <ChoiceGroup label="Resolução" className="segmented-control four" value={resolution} onValueChange={setResolution} options={RESOLUTIONS.map((value) => ({ value, label: value === "source" ? "Original" : value }))} />
            </fieldset>
            <fieldset>
              <legend>FPS</legend>
              <ChoiceGroup label="FPS" className="segmented-control" value={String(frameRate)} onValueChange={(value) => setFrameRate(value === "60" ? 60 : 30)} options={[{ value: "30", label: "30" }, { value: "60", label: "60" }]} />
            </fieldset>
            <fieldset>
              <legend>Qualidade</legend>
              <ChoiceGroup label="Qualidade" className="segmented-control three" value={quality} onValueChange={setQuality} options={[{ value: "auto", label: "Auto" }, { value: "high", label: "Alta" }, { value: "custom", label: "Personalizada" }]} />
              {quality === "custom" && (
                <label className="bitrate-field">
                  <span>Bitrate</span>
                  <input
                    type="number"
                    min={2}
                    max={25}
                    value={customBitrate}
                    onChange={(event) => setCustomBitrate(Number(event.target.value))}
                  />
                  <span>Mbps</span>
                </label>
              )}
            </fieldset>
            <div className="audio-status">
              <Volume2 size={17} />
              <div>
                <strong>Áudio da fonte</strong>
                <span>No seletor do navegador, ative o áudio quando a opção estiver disponível.</span>
              </div>
            </div>
          </div>

          <div className="share-summary">
            <Check size={16} /> {summary}
          </div>
          <p className="privacy-note">
            <ShieldCheck size={17} />
            <span>
              Apenas a tela, janela ou aba que você escolher será compartilhada.
            </span>
          </p>
          {startError && <p className="form-error share-start-error" role="alert">{startError}</p>}

          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={onCancel}>Cancelar</button>
            <button type="button" className="button primary" onClick={handleStart} disabled={starting}>
              <MonitorUp size={17} /> {starting ? "Abrindo seletor…" : "Escolher e transmitir"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
