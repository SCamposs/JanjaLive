import { z } from "zod";

export const captureSelectionSchema = z.object({
  token: z.string().uuid(),
  withSystemAudio: z.boolean(),
}).strict();

export const updaterStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }),
  z.object({ state: z.literal("checking") }),
  z.object({ state: z.literal("up-to-date") }),
  z.object({ state: z.literal("downloading"), percent: z.number().min(0).max(100) }),
  z.object({ state: z.literal("ready"), version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/) }),
  z.object({ state: z.literal("error") }),
]);

export type UpdaterStatus = z.infer<typeof updaterStatusSchema>;

export type CaptureSource = {
  token: string;
  name: string;
  kind: "screen" | "window";
  thumbnailDataUrl: string;
};

export type JanjaDesktopApi = {
  app: { getVersion(): Promise<string> };
  capture: {
    listSources(): Promise<CaptureSource[]>;
    selectSource(input: { token: string; withSystemAudio: boolean }): Promise<void>;
    cancelSelection(): Promise<void>;
  };
  auth: { start(): Promise<void> };
  updater: {
    check(): Promise<void>;
    getStatus(): Promise<UpdaterStatus>;
    restartAndInstall(): Promise<void>;
    onStatus(listener: (status: UpdaterStatus) => void): () => void;
  };
};
