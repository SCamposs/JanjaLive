"use server";

import { requireUser } from "@/lib/api";
import { desktopCallLink, startCall } from "@/lib/discord/calls";
import { discordMessage } from "@/lib/discord/config";
import { isRoomCreationErrorCode, roomCreationErrorMessage } from "@janjalive/realtime-protocol";

export type CallStartState = { publicId?: string; desktopLink?: string; cardPublished?: boolean; cardStatus?: "published" | "pending" | "failed"; error?: string };

export async function startCallAction(intentId: string, previous: CallStartState, form: FormData): Promise<CallStartState> {
  void previous;
  try {
    const user = await requireUser();
    const { room, cardPublished, cardStatus } = await startCall(intentId, user.id, form.get("cardAction") === "verify");
    return { publicId: room.publicId, desktopLink: desktopCallLink(room), cardPublished, cardStatus };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return { error: isRoomCreationErrorCode(code) ? roomCreationErrorMessage(error) : discordMessage(error) };
  }
}
