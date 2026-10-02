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

export const desktopUserSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  image: z.string().url().nullable(),
}).strict();

export const authStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("signed-out") }),
  z.object({ state: z.literal("connecting") }),
  z.object({ state: z.literal("signed-in"), user: desktopUserSchema }),
  z.object({ state: z.literal("error"), message: z.string().max(160) }),
]);

export const authExchangeResponseSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  expiresAt: z.string().datetime(),
  user: desktopUserSchema,
}).strict();

export type AuthStatus = z.infer<typeof authStatusSchema>;

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
  auth: {
    start(): Promise<void>;
    getStatus(): Promise<AuthStatus>;
    logout(): Promise<void>;
    onStatus(listener: (status: AuthStatus) => void): () => void;
  };
  updater: {
    check(): Promise<void>;
    getStatus(): Promise<UpdaterStatus>;
    restartAndInstall(): Promise<void>;
    onStatus(listener: (status: UpdaterStatus) => void): () => void;
  };
};
