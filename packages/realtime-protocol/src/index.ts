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

export const streamMetadataSchema = z.object({
  preset: qualityPresetSchema,
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  frameRate: z.number().positive().max(240),
  hasAudio: z.boolean(),
}).strict();

const sessionDescriptionSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(150_000),
}).strict();

const candidateSchema = z.object({
  candidate: z.string().max(10_000),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
}).strict();

export const clientSignalingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presence:join") }).strict(),
  z.object({ type: z.literal("presence:leave") }).strict(),
  z.object({ type: z.literal("stream:start"), metadata: streamMetadataSchema }).strict(),
  z.object({ type: z.literal("stream:stop") }).strict(),
  z.object({ type: z.literal("watch:request"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("watch:stop"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({
    type: z.literal("webrtc:offer"),
    targetUserId: z.string().min(1).max(128),
    description: sessionDescriptionSchema,
  }).strict(),
  z.object({
    type: z.literal("webrtc:answer"),
    targetUserId: z.string().min(1).max(128),
    description: sessionDescriptionSchema,
  }).strict(),
  z.object({
    type: z.literal("webrtc:ice-candidate"),
    targetUserId: z.string().min(1).max(128),
    candidate: candidateSchema,
  }).strict(),
]);

export const roomLifecycleEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room:join-request") }).strict(),
  z.object({ type: z.literal("room:approved"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:rejected"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:revoked"), targetUserId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("room:closed") }).strict(),
]);

export const signalingEventSchema = z.union([clientSignalingEventSchema, roomLifecycleEventSchema]);
export const signalEnvelopeSchema = clientSignalingEventSchema.and(z.object({ roomId: z.string().uuid() }));

export const activeStreamSchema = streamMetadataSchema.extend({
  streamerUserId: z.string().min(1).max(128),
  startedAt: z.number().int().nonnegative(),
});

export const realtimeEventSchema = z.object({
  id: z.string().min(1).max(128),
  senderUserId: z.string().min(1).max(128),
  sentAt: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(),
  payload: signalingEventSchema,
});

export const realtimeSocketMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    onlineUserIds: z.array(z.string().min(1).max(128)).max(100),
    activeStreams: z.array(activeStreamSchema).max(100),
  }).strict(),
  z.object({ type: z.literal("event"), event: realtimeEventSchema }).strict(),
]);

export const realtimeSessionSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("upstash") }).strict(),
  z.object({
    provider: z.literal("cloudflare"),
    url: z.string().url().startsWith("https://"),
    token: z.string().min(32).max(4096),
    expiresAt: z.string().datetime(),
  }).strict(),
]);

export type StreamMetadata = z.infer<typeof streamMetadataSchema>;
export type ActiveStream = z.infer<typeof activeStreamSchema>;
export type ClientSignal = z.infer<typeof clientSignalingEventSchema>;
export type ServerSignal = z.infer<typeof signalingEventSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeSocketMessage = z.infer<typeof realtimeSocketMessageSchema>;
export type RealtimeSession = z.infer<typeof realtimeSessionSchema>;
