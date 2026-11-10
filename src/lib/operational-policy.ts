import { ROOM_CREATION_LIMITS } from "@janjalive/realtime-protocol";

// Server-side switches. Changing them requires a deployment, not a new service.
export const RESOURCE_LIMITS = {
  ...ROOM_CREATION_LIMITS,
  membersPerRoom: 20,
  turnRequestsPerHour: 60,
} as const;

export function assertRoomCreationEnabled() {
  if (process.env.ROOM_CREATION_ENABLED === "false") throw new Error("ROOM_CREATION_PAUSED");
}

export function isTurnEnabled() {
  return process.env.TURN_ENABLED !== "false";
}
