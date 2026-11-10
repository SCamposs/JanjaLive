"use client";

import { createContext, useCallback, useContext, useId, useState, type ReactNode } from "react";

const VOLUME_KEY = "janjalive:player-volume";
const AudioFocus = createContext<{ focused: string | null; focus: (id: string) => void } | null>(null);

export function PlayerAudioProvider({ children }: { children: ReactNode }) {
  const [focused, focus] = useState<string | null>(null);
  return <AudioFocus.Provider value={{ focused, focus }}>{children}</AudioFocus.Provider>;
}

export function usePlayerAudio(initiallyMuted: boolean) {
  const id = useId();
  const group = useContext(AudioFocus);
  const [silent, setSilent] = useState(initiallyMuted);
  const [volume, updateVolume] = useState(() => {
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY);
      const value = saved === null ? 1 : Number(saved);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
    } catch { return 1; }
  });
  const muted = silent || Boolean(group?.focused && group.focused !== id);
  function setMuted(next: boolean | ((value: boolean) => boolean)) {
    const value = typeof next === "function" ? next(muted) : next;
    if (!value) group?.focus(id);
    setSilent(value);
  }
  function setVolume(value: number) {
    const next = Math.max(0, Math.min(1, value));
    updateVolume(next);
    if (next > 0) setMuted(false);
    try { window.localStorage.setItem(VOLUME_KEY, String(next)); } catch { /* Storage can be unavailable. */ }
  }
  const silence = useCallback(() => setSilent(true), []);
  return { muted, setMuted, silence, volume, setVolume };
}
