import { z } from "zod";
import {
  clientSignalingEventSchema,
  signalEnvelopeSchema,
  signalingEventSchema,
  type ServerSignal as SignalingEvent,
} from "@janjalive/realtime-protocol";

export { clientSignalingEventSchema, signalEnvelopeSchema, signalingEventSchema };
export type { SignalingEvent };

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
