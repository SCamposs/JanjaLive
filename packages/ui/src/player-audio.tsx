"use client";

import { useCallback, useState } from "react";

const VOLUME_KEY = "janjalive:player-volume";

export function usePlayerAudio(initiallyMuted: boolean) {
  const [muted, setMuted] = useState(initiallyMuted);
  const [volume, updateVolume] = useState(() => {
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY);
      const value = saved === null ? 1 : Number(saved);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
    } catch { return 1; }
  });
  function setVolume(value: number) {
    const next = Math.max(0, Math.min(1, value));
    updateVolume(next);
    try { window.localStorage.setItem(VOLUME_KEY, String(next)); } catch { /* Storage can be unavailable. */ }
  }
  const silence = useCallback(() => setMuted(true), []);
  return { muted, setMuted, silence, volume, setVolume };
}
