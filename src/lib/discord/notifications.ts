import { after } from "next/server";
import type { Room } from "@/db/schema";
import { discordEnabled } from "./config";

export function scheduleClosedCallCard(room: Room | undefined) {
  if (!room?.discordGuildId || !discordEnabled()) return;
  after(async () => {
    try { await (await import("./calls")).closeCallCard(room); }
    catch { console.warn("Discord room card could not be closed."); }
  });
}
