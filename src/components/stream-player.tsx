"use client";

import { TooltipButton, usePlayerControlsAutoHide, usePlayerAudio, useVideoActions, PlayerVolumeControl } from "@janjalive/ui";

import { Maximize, Minimize2, PictureInPicture2, Scaling, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@janjalive/webrtc";
import { AudienceBadge } from "./audience-badge";

type Props = {
  stream: MediaStream;
  streamerName: string;
  status: ConnectionStatus;
  onStop: () => void;
  mode?: "remote" | "local";
  initiallyMuted?: boolean;
  viewerNames?: string[];
};

export function StreamPlayer({ stream, streamerName, status, onStop, mode = "remote", initiallyMuted = mode === "local", viewerNames }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { muted, setMuted, silence, volume, setVolume } = usePlayerAudio(initiallyMuted);
  const actions = useVideoActions(videoRef, containerRef, () => { if (mode === "remote") setMuted((value) => !value); });
  const isFullscreen = actions.fullscreen;
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const { controlsVisible, showControls, containerProps, controlsProps } = usePlayerControlsAutoHide();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    let disposed = false;
    setIsPlaying(false);
    setPlaybackBlocked(false);
    setFitMode("contain");
    showControls();
    void video.play().catch(() => {
      if (disposed) return;
      if (mode === "local") return;
      video.muted = true;
      silence();
      void video.play().catch(() => { if (!disposed) setPlaybackBlocked(true); });
    });
    return () => { disposed = true; video.srcObject = null; };
  }, [mode, showControls, silence, stream]);

  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [stream, volume]);

  return (
    <div className="player-shell" data-fit={fitMode} data-controls-visible={controlsVisible} ref={containerRef} tabIndex={0} aria-label={`Transmissão de ${streamerName}. M silencia, F abre tela cheia.`} onKeyDown={actions.onKeyDown} {...containerProps}>
      {viewerNames && <AudienceBadge names={viewerNames} />}
      <video ref={videoRef} autoPlay playsInline muted={mode === "local" || muted} onDoubleClick={actions.toggleFullscreen} onPlaying={() => { setIsPlaying(true); setPlaybackBlocked(false); }} onWaiting={() => setIsPlaying(false)} />
      {!isPlaying && (
        <div className="player-waiting">
          <span>{playbackBlocked ? "Toque para reproduzir" : "Conectando à transmissão…"}</span>
          {playbackBlocked && <button type="button" onClick={() => void videoRef.current?.play().catch(() => setPlaybackBlocked(true))}>Reproduzir</button>}
        </div>
      )}
      <div className="player-label">
        <strong>{streamerName}</strong>
        {mode === "remote" && status !== "good" && (
          <><span className={`connection-dot ${status}`} /><span>{status === "unstable" ? "Instável" : status === "connecting" ? "Conectando" : "Reconectando"}</span></>
        )}
      </div>
      {actions.error && <p className="player-action-error" role="alert">{actions.error}</p>}
      <div className="player-controls" data-player-controls {...controlsProps}>
        {mode === "remote" && <PlayerVolumeControl muted={muted} volume={volume} onToggleMute={() => setMuted((value) => !value)} onVolumeChange={setVolume} icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />} />}
        <span className="control-spacer" />
        <TooltipButton className="icon-button" tooltip={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} type="button" onClick={() => setFitMode((value) => value === "contain" ? "cover" : "contain")} aria-label={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"}>
          <Scaling size={18} />
        </TooltipButton>
        <TooltipButton className="icon-button" tooltip="Picture in Picture" type="button" disabled={!actions.support.pip} onClick={actions.togglePip} aria-label="Picture in Picture">
          <PictureInPicture2 size={18} />
        </TooltipButton>
        <TooltipButton className="icon-button" tooltip={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} type="button" disabled={!actions.support.fullscreen} onClick={actions.toggleFullscreen} aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize size={18} />}
        </TooltipButton>
        <TooltipButton className="stop-button" tooltip={mode === "local" ? "Encerrar transmissão" : "Parar de assistir"} type="button" onClick={onStop} aria-label={mode === "local" ? "Encerrar transmissão" : "Parar de assistir"}>
          <X size={16} /> <span>{mode === "local" ? "Encerrar transmissão" : "Parar de assistir"}</span>
        </TooltipButton>
      </div>
    </div>
  );
}
