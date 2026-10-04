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
  z.object({ state: z.literal("required") }),
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

const qualityPresetSchema = z.enum([
  "720p30", "720p60", "1080p30", "1080p60", "1440p30", "1440p60", "source",
]);

const roomMemberSchema = z.object({
  userId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  image: z.string().url().nullable(),
  role: z.enum(["OWNER", "MEMBER"]),
}).strict();

export const roomSummarySchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().min(8).max(64),
  name: z.string().min(1).max(60),
  role: z.enum(["OWNER", "MEMBER"]),
  expiresAt: z.string().datetime(),
  expiresInMs: z.number().nonnegative(),
}).strict();

export const roomSnapshotSchema = z.object({
  room: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(60),
    publicId: z.string().min(8).max(64),
    code: z.string().length(7),
    accessMode: z.enum(["APPROVAL", "INVITE"]),
    isOwner: z.boolean(),
  }).strict(),
  access: z.enum(["authorized", "invited", "pending", "rejected"]),
  members: z.array(roomMemberSchema).max(100),
  pending: z.array(roomMemberSchema.omit({ role: true })).max(100),
}).strict();

export const roomCreateInputSchema = z.object({
  name: z.string().trim().max(60).optional().transform((value) => value || undefined),
  accessMode: z.enum(["APPROVAL", "INVITE"]),
}).strict();

export const membershipActionSchema = z.object({
  userId: z.string().min(1).max(128),
  action: z.enum(["approve", "reject", "revoke"]),
}).strict();

const streamMetadataSchema = z.object({
  preset: qualityPresetSchema,
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  frameRate: z.number().positive().max(240),
  hasAudio: z.boolean(),
}).strict();

const descriptionSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(150_000),
}).strict();

const candidateSchema = z.object({
  candidate: z.string().max(10_000),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
}).strict();

export const clientSignalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presence:join") }).strict(),
  z.object({ type: z.literal("presence:leave") }).strict(),
  z.object({ type: z.literal("stream:start"), metadata: streamMetadataSchema }).strict(),
  z.object({ type: z.literal("stream:stop") }).strict(),
  z.object({ type: z.literal("watch:request"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("watch:stop"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("webrtc:offer"), targetUserId: z.string().min(1).max(128), description: descriptionSchema }).strict(),
  z.object({ type: z.literal("webrtc:answer"), targetUserId: z.string().min(1).max(128), description: descriptionSchema }).strict(),
  z.object({ type: z.literal("webrtc:ice-candidate"), targetUserId: z.string().min(1).max(128), candidate: candidateSchema }).strict(),
]);

const serverSignalSchema = z.union([
  clientSignalSchema,
  z.object({ type: z.literal("room:join-request") }).strict(),
  z.object({ type: z.literal("room:approved"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:rejected"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:revoked"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:closed") }).strict(),
]);

export const realtimePollSchema = z.object({
  events: z.array(z.object({
    id: z.string().min(1).max(128),
    senderUserId: z.string().min(1).max(128),
    sentAt: z.number(),
    cursor: z.number().int().nonnegative(),
    payload: serverSignalSchema,
  }).strict()).max(400),
  onlineUserIds: z.array(z.string().min(1).max(128)).max(100),
  activeStreams: z.array(streamMetadataSchema.extend({
    streamerUserId: z.string().min(1).max(128),
    startedAt: z.number(),
  }).strict()).max(100),
  cursor: z.number().int().nonnegative(),
}).strict();

export const iceServersSchema = z.object({
  iceServers: z.array(z.object({
    urls: z.union([z.string(), z.array(z.string())]),
    username: z.string().optional(),
    credential: z.string().optional(),
  }).passthrough()).max(20),
  hasTurn: z.boolean(),
}).strict();

export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type ClientSignal = z.infer<typeof clientSignalSchema>;
export type ServerSignal = z.infer<typeof serverSignalSchema>;
export type RealtimePoll = z.infer<typeof realtimePollSchema>;

export type JanjaDesktopApi = {
  app: {
    getVersion(): Promise<string>;
    onRoomInvite(listener: (token: string) => void): () => void;
  };
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
  rooms: {
    list(): Promise<RoomSummary[]>;
    get(roomId: string): Promise<RoomSnapshot>;
    getPublic(publicId: string): Promise<RoomSnapshot>;
    create(input: z.input<typeof roomCreateInputSchema>): Promise<RoomSnapshot>;
    joinCode(code: string): Promise<RoomSnapshot>;
    openInvite(token: string): Promise<RoomSnapshot>;
    requestAccess(roomId: string): Promise<void>;
    manageMember(roomId: string, input: z.infer<typeof membershipActionSchema>): Promise<RoomSnapshot>;
    copyCode(code: string): Promise<void>;
    copyInvite(roomId: string): Promise<void>;
    delete(roomId: string): Promise<void>;
  };
  realtime: {
    poll(roomId: string, since: number): Promise<RealtimePoll>;
    send(roomId: string, signal: ClientSignal): Promise<void>;
    getIceServers(roomId: string): Promise<RTCIceServer[]>;
  };
  updater: {
    check(): Promise<void>;
    getStatus(): Promise<UpdaterStatus>;
    restartAndInstall(): Promise<void>;
    onStatus(listener: (status: UpdaterStatus) => void): () => void;
  };
};
