export type RoomState = {
  closedAt: Date | null;
  expiresAt: Date;
};

export type MembershipState = {
  role: "OWNER" | "MEMBER";
  revokedAt: Date | null;
};

export function isRoomActive(room: RoomState, now = new Date()): boolean {
  return room.closedAt === null && room.expiresAt > now;
}

export function isAuthorizedMember(member: MembershipState | null | undefined): boolean {
  return Boolean(member && member.revokedAt === null);
}

export function canManageRoom(member: MembershipState | null | undefined): boolean {
  return isAuthorizedMember(member) && member?.role === "OWNER";
}

export function canAutoJoinInvite(
  member: MembershipState | null | undefined,
  accessMode: "APPROVAL" | "INVITE",
  hasValidInvite: boolean,
): boolean {
  return hasValidInvite && accessMode === "INVITE" && member === undefined;
}

export function assertRoomAccess(room: RoomState, member: MembershipState | null | undefined): void {
  if (!isRoomActive(room)) throw new Error("ROOM_UNAVAILABLE");
  if (!isAuthorizedMember(member)) throw new Error("ROOM_FORBIDDEN");
}

export function canSignalToMember(
  sender: MembershipState | null | undefined,
  target: MembershipState | null | undefined,
): boolean {
  return isAuthorizedMember(sender) && isAuthorizedMember(target);
}
