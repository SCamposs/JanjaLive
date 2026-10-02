"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, MonitorUp, ShieldCheck, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  QUALITY_PROFILES,
  clampCustomBitrate,
  getCaptureConstraints,
  type QualityPreset,
} from "@/lib/quality";

type Props = {
  stream: MediaStream | null;
  onCancel: () => void;
  onStart: (options: {
    stream: MediaStream;
    preset: QualityPreset;
    bitrate: number;
    frameRate: number;
  }) => Promise<void>;
};

const RESOLUTIONS = ["720p", "1080p", "1440p", "source"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

function toPreset(resolution: Resolution, frameRate: 30 | 60): QualityPreset {
  if (resolution === "source") return "source";
  return `${resolution}${frameRate}` as QualityPreset;
}

export function ScreenShareDialog({ stream, onCancel, onStart }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [frameRate, setFrameRate] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<"auto" | "high" | "custom">("auto");
  const [customBitrate, setCustomBitrate] = useState(10);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const preset = toPreset(resolution, frameRate);
  const profile = QUALITY_PROFILES[preset];
  const bitrate = quality === "custom" ? clampCustomBitrate(customBitrate) : quality === "high" ? Math.min(25_000_000, profile.bitrate * 1.35) : profile.bitrate;
  const videoTrack = stream?.getVideoTracks()[0];
  const settings = videoTrack?.getSettings();
  const hasAudio = Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));

  const summary = useMemo(() => {
    const width = settings?.width ?? profile.width;
    const height = settings?.height ?? profile.height;
    const dimensions = width && height ? `${width}×${height}` : "Source";
    return `${dimensions} · ${frameRate} FPS · ~${Math.round(bitrate / 1_000_000)} Mbps por pessoa`;
  }, [bitrate, frameRate, profile.height, profile.width, settings?.height, settings?.width]);

  async function handleStart() {
    if (!stream || !videoTrack) return;
    setStarting(true);
    setStartError(null);
    try {
      const constraints = getCaptureConstraints(preset);
      if (resolution === "source") constraints.frameRate = { ideal: frameRate, max: frameRate };
      await videoTrack.applyConstraints(constraints).catch(() => undefined);
      await onStart({ stream, preset, bitrate, frameRate });
    } catch {
      setStartError("Não foi possível iniciar a transmissão. Tente selecionar a fonte novamente.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog.Root open={Boolean(stream)} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="share-dialog" aria-describedby="share-description">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>Compartilhar sua tela</Dialog.Title>
              <Dialog.Description id="share-description">
                Confira o que será compartilhado antes de começar.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Fechar">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="share-preview">
            <video ref={videoRef} autoPlay muted playsInline />
            <span className="preview-chip">
              <MonitorUp size={14} /> {settings?.displaySurface === "browser" ? "Aba" : settings?.displaySurface === "window" ? "Janela" : "Tela selecionada"}
            </span>
          </div>

          <div className="share-controls">
            <fieldset>
              <legend>Resolução</legend>
              <div className="segmented-control four">
                {RESOLUTIONS.map((value) => (
                  <button key={value} type="button" data-active={resolution === value} onClick={() => setResolution(value)}>
                    {value === "source" ? "Original" : value}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>FPS</legend>
              <div className="segmented-control">
                {[30, 60].map((value) => (
                  <button key={value} type="button" data-active={frameRate === value} onClick={() => setFrameRate(value as 30 | 60)}>
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Qualidade</legend>
              <div className="segmented-control three">
                {(["auto", "high", "custom"] as const).map((value) => (
                  <button key={value} type="button" data-active={quality === value} onClick={() => setQuality(value)}>
                    {value === "auto" ? "Auto" : value === "high" ? "Alta" : "Personalizada"}
                  </button>
                ))}
              </div>
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
              {hasAudio ? <Volume2 size={17} /> : <VolumeX size={17} />}
              <div>
                <strong>Áudio do sistema</strong>
                <span>{hasAudio ? "Ativo para esta fonte" : "Para compartilhar áudio, prefira uma guia ou a tela inteira"}</span>
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
              <MonitorUp size={17} /> {starting ? "Preparando…" : "Começar transmissão"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
