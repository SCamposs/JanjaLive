"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";

export function useVideoActions(videoRef: RefObject<HTMLVideoElement | null>, containerRef: RefObject<HTMLDivElement | null>, toggleMute: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [support, setSupport] = useState({ fullscreen: false, pip: false });
  useEffect(() => {
    setSupport({ fullscreen: Boolean(document.fullscreenEnabled && containerRef.current?.requestFullscreen), pip: Boolean(document.pictureInPictureEnabled && videoRef.current?.requestPictureInPicture) });
    const changed = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [containerRef, videoRef]);
  async function toggleFullscreen() {
    if (!support.fullscreen) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
      setError(null);
    } catch { setError("Não foi possível abrir a tela cheia. Tente novamente."); }
  }
  async function togglePip() {
    if (!support.pip) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
      setError(null);
    } catch { setError("Não foi possível abrir a janela flutuante. Tente novamente."); }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key.toLowerCase() === "m") { event.preventDefault(); toggleMute(); }
    if (event.key.toLowerCase() === "f") { event.preventDefault(); void toggleFullscreen(); }
  }
  return { support, fullscreen, toggleFullscreen, togglePip, onKeyDown, error };
}
