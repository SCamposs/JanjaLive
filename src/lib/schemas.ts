import { z } from "zod";
import { qualityPresetSchema } from "./quality";

export const createRoomSchema = z.object({
  name: z.string().trim().max(60).optional().transform((value) => value || undefined),
  accessMode: z.enum(["APPROVAL", "INVITE"]).default("APPROVAL"),
}).strict();

export const roomCodeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[2-9A-HJ-NP-Z]{7}$/),
});

export const membershipActionSchema = z.object({
  action: z.enum(["approve", "reject", "revoke"]),
  userId: z.string().min(1).max(128),
});

const streamMetadataSchema = z.object({
  preset: qualityPresetSchema,
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  frameRate: z.number().positive().max(240),
  hasAudio: z.boolean(),
});

const sessionDescriptionSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(150_000),
});

const candidateSchema = z.object({
  candidate: z.string().max(10_000),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

export const clientSignalingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presence:join") }),
  z.object({ type: z.literal("presence:leave") }),
  z.object({ type: z.literal("stream:start"), metadata: streamMetadataSchema }),
  z.object({ type: z.literal("stream:stop") }),
  z.object({ type: z.literal("watch:request"), targetUserId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("watch:stop"), targetUserId: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("webrtc:offer"),
    targetUserId: z.string().min(1).max(128),
    description: sessionDescriptionSchema,
  }),
  z.object({
    type: z.literal("webrtc:answer"),
    targetUserId: z.string().min(1).max(128),
    description: sessionDescriptionSchema,
  }),
  z.object({
    type: z.literal("webrtc:ice-candidate"),
    targetUserId: z.string().min(1).max(128),
    candidate: candidateSchema,
  }),
]);

const roomLifecycleEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room:join-request") }),
  z.object({ type: z.literal("room:approved"), targetUserId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("room:rejected"), targetUserId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("room:revoked"), targetUserId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("room:closed") }),
]);

export const signalingEventSchema = z.union([clientSignalingEventSchema, roomLifecycleEventSchema]);

export type SignalingEvent = z.infer<typeof signalingEventSchema>;

export const signalEnvelopeSchema = clientSignalingEventSchema.and(
  z.object({
    roomId: z.string().uuid(),
  }),
);
