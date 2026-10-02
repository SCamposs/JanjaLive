"use client";

import { Maximize, Minimize2, PictureInPicture2, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  stream: MediaStream;
  streamerName: string;
  status: "good" | "unstable" | "reconnecting";
  onStop: () => void;
  mode?: "remote" | "local";
};

export function StreamPlayer({ stream, streamerName, status, onStop, mode = "remote" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(mode === "local");
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

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
    <div className="player-shell" ref={containerRef}>
      <video ref={videoRef} autoPlay playsInline muted={mode === "local" || muted} onDoubleClick={toggleFullscreen} />
      <div className="player-label">
        <strong>{streamerName}</strong>
        {mode === "remote" && status !== "good" && (
          <><span className={`connection-dot ${status}`} /><span>{status === "unstable" ? "Instável" : "Reconectando"}</span></>
        )}
      </div>
      <div className="player-controls">
        {mode === "remote" && (
          <>
            <button className="icon-button" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"}>
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
        <button className="icon-button" type="button" onClick={togglePictureInPicture} aria-label="Picture in Picture">
          <PictureInPicture2 size={18} />
        </button>
        <button className="icon-button" type="button" onClick={toggleFullscreen} aria-label="Tela cheia">
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize size={18} />}
        </button>
        <button className="stop-button" type="button" onClick={onStop}>
          <X size={16} /> {mode === "local" ? "Encerrar transmissão" : "Parar de assistir"}
        </button>
      </div>
    </div>
  );
}
