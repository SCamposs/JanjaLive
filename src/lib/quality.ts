import { z } from "zod";

export const qualityPresetSchema = z.enum([
  "720p30",
  "720p60",
  "1080p30",
  "1080p60",
  "1440p30",
  "1440p60",
  "source",
]);

export type QualityPreset = z.infer<typeof qualityPresetSchema>;

export type QualityProfile = {
  label: string;
  width?: number;
  height?: number;
  frameRate?: number;
  bitrate: number;
};

export const QUALITY_PROFILES: Record<QualityPreset, QualityProfile> = {
  "720p30": { label: "720p · 30 FPS", width: 1280, height: 720, frameRate: 30, bitrate: 3_500_000 },
  "720p60": { label: "720p · 60 FPS", width: 1280, height: 720, frameRate: 60, bitrate: 5_000_000 },
  "1080p30": { label: "1080p · 30 FPS", width: 1920, height: 1080, frameRate: 30, bitrate: 6_000_000 },
  "1080p60": { label: "1080p · 60 FPS", width: 1920, height: 1080, frameRate: 60, bitrate: 10_000_000 },
  "1440p30": { label: "1440p · 30 FPS", width: 2560, height: 1440, frameRate: 30, bitrate: 10_000_000 },
  "1440p60": { label: "1440p · 60 FPS", width: 2560, height: 1440, frameRate: 60, bitrate: 16_000_000 },
  source: { label: "Source", bitrate: 12_000_000 },
};

export function clampCustomBitrate(megabits: number): number {
  return Math.min(25, Math.max(2, megabits)) * 1_000_000;
}

export function estimateOutboundMbps(bitrate: number, viewers: number): number {
  return Math.round((bitrate * viewers) / 1_000_000);
}

export function getCaptureConstraints(preset: QualityPreset): MediaTrackConstraints {
  const profile = QUALITY_PROFILES[preset];
  if (!profile.width || !profile.height || !profile.frameRate) return {};

  return {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: profile.frameRate, max: profile.frameRate },
  };
}
