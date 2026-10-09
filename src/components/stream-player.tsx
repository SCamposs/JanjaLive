"use client";

import { Maximize, Minimize2, PictureInPicture2, Scaling, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@janjalive/webrtc";

type Props = {
  stream: MediaStream;
  streamerName: string;
  status: ConnectionStatus;
  onStop: () => void;
  mode?: "remote" | "local";
};

export function StreamPlayer({ stream, streamerName, status, onStop, mode = "remote" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(mode === "local");
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = mode === "local";
    setMuted(mode === "local");
    setIsPlaying(false);
    setPlaybackBlocked(false);
    setFitMode("contain");
    void video.play().catch(() => {
      if (mode === "local") return;
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => setPlaybackBlocked(true));
    });
  }, [mode, stream]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video || !("requestPictureInPicture" in video)) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  }

  return (
    <div className="player-shell" data-fit={fitMode} ref={containerRef}>
      <video ref={videoRef} autoPlay playsInline muted={mode === "local" || muted} onDoubleClick={toggleFullscreen} onPlaying={() => { setIsPlaying(true); setPlaybackBlocked(false); }} onWaiting={() => setIsPlaying(false)} />
      {!isPlaying && (
        <div className="player-waiting">
          <span>{playbackBlocked ? "Toque para reproduzir" : "Conectando à transmissão…"}</span>
          {playbackBlocked && <button type="button" onClick={() => void videoRef.current?.play()}>Reproduzir</button>}
        </div>
      )}
      <div className="player-label">
        <strong>{streamerName}</strong>
        {mode === "remote" && status !== "good" && (
          <><span className={`connection-dot ${status}`} /><span>{status === "unstable" ? "Instável" : status === "connecting" ? "Conectando" : "Reconectando"}</span></>
        )}
      </div>
      <div className="player-controls">
        {mode === "remote" && (
          <>
            <button className="icon-button" data-tooltip={muted ? "Ativar som" : "Silenciar"} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                if (videoRef.current) videoRef.current.volume = next;
              }}
            />
          </>
        )}
        <span className="control-spacer" />
        <button className="icon-button" data-tooltip={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"} type="button" onClick={() => setFitMode((value) => value === "contain" ? "cover" : "contain")} aria-label={fitMode === "contain" ? "Preencher quadro" : "Ajustar à tela"}>
          <Scaling size={18} />
        </button>
        <button className="icon-button" data-tooltip="Picture in Picture" type="button" onClick={togglePictureInPicture} aria-label="Picture in Picture">
          <PictureInPicture2 size={18} />
        </button>
        <button className="icon-button" data-tooltip={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize size={18} />}
        </button>
        <button className="stop-button" data-tooltip={mode === "local" ? "Encerrar transmissão" : "Parar de assistir"} type="button" onClick={onStop} aria-label={mode === "local" ? "Encerrar transmissão" : "Parar de assistir"}>
          <X size={16} /> <span>{mode === "local" ? "Encerrar transmissão" : "Parar de assistir"}</span>
        </button>
      </div>
    </div>
  );
}
