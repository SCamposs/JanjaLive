"use client";

import { useState } from "react";

type CapturePreferences = {
  resolution: "720p" | "1080p" | "1440p" | "source";
  fps: 30 | 60;
  quality: "auto" | "high" | "custom";
  customBitrate: number;
};
const KEY = "janjalive:capture-preferences";
const defaults: CapturePreferences = { resolution: "1080p", fps: 60, quality: "auto", customBitrate: 10 };

function read(): CapturePreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return defaults;
    return {
      resolution: ["720p", "1080p", "1440p", "source"].includes(value.resolution) ? value.resolution : defaults.resolution,
      fps: value.fps === 30 ? 30 : 60,
      quality: ["auto", "high", "custom"].includes(value.quality) ? value.quality : defaults.quality,
      customBitrate: typeof value.customBitrate === "number" && Number.isFinite(value.customBitrate) ? Math.max(2, Math.min(25, value.customBitrate)) : defaults.customBitrate,
    };
  } catch { return defaults; }
}

export function useCapturePreferences() {
  const [preferences, setPreferences] = useState(read);
  function update<K extends keyof CapturePreferences>(key: K, value: CapturePreferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Preferences are optional. */ }
  }
  return {
    ...preferences,
    setResolution: (value: CapturePreferences["resolution"]) => update("resolution", value),
    setFps: (value: CapturePreferences["fps"]) => update("fps", value),
    setQuality: (value: CapturePreferences["quality"]) => update("quality", value),
    setCustomBitrate: (value: number) => update("customBitrate", value),
  };
}
