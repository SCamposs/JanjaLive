"use server";

import { requireUser } from "@/lib/api";
import { desktopCallLink, startCall } from "@/lib/discord/calls";
import { discordMessage } from "@/lib/discord/config";
import { isRoomCreationErrorCode, roomCreationErrorMessage } from "@janjalive/realtime-protocol";

export type CallStartState = { publicId?: string; desktopLink?: string; cardPublished?: boolean; error?: string };

export async function startCallAction(intentId: string, previous: CallStartState): Promise<CallStartState> {
  void previous;
  try {
    const user = await requireUser();
    const { room, cardPublished } = await startCall(intentId, user.id);
    return { publicId: room.publicId, desktopLink: desktopCallLink(room), cardPublished };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return { error: isRoomCreationErrorCode(code) ? roomCreationErrorMessage(error) : discordMessage(error) };
  }
}
