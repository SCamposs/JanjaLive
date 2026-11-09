import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

type InviteRoom = { publicId: string; inviteHash: string };
const SHAREABLE_INVITE = /^s1_([A-Za-z0-9_-]{18})([A-Za-z0-9_-]{43})$/;

export function shareableInviteRoomId(token: string) {
  return SHAREABLE_INVITE.exec(token)?.[1] ?? null;
}

export function createShareableInvite(room: InviteRoom, secret = process.env.AUTH_SECRET) {
  if (!secret) throw new Error("AUTH_NOT_CONFIGURED");
  const signature = createHmac("sha256", secret).update(`janjalive:room-invite:${room.publicId}:${room.inviteHash}`).digest("base64url");
  return `s1_${room.publicId}${signature}`;
}

export function verifyShareableInvite(token: string, room: InviteRoom) {
  return shareableInviteRoomId(token) === room.publicId && safeEqual(token, createShareableInvite(room));
}
