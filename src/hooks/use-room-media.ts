"use client";

import { useMemo } from "react";
import {
  useRoomMediaCore,
  type ClientSignal,
  type RealtimePoll,
  type RoomMediaTransport,
} from "@janjalive/webrtc";

export function useRoomMedia(roomId: string, userId: string) {
  const transport = useMemo<RoomMediaTransport>(() => ({
    async send(targetRoomId: string, payload: ClientSignal) {
      const response = await fetch(`/api/rooms/${targetRoomId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`API_${response.status}`);
    },
    async poll(targetRoomId: string, since: number) {
      const response = await fetch(`/api/rooms/${targetRoomId}/signals?since=${since}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API_${response.status}`);
      return await response.json() as RealtimePoll;
    },
    async getIceServers(targetRoomId: string) {
      const response = await fetch(`/api/ice-servers?roomId=${encodeURIComponent(targetRoomId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API_${response.status}`);
      const data = await response.json() as { iceServers: RTCIceServer[] };
      return data.iceServers;
    },
    isRoomUnavailable(error: unknown) {
      return String(error).includes("API_403") || String(error).includes("API_404");
    },
  }), []);

  const initialOnlineUserIds = useMemo(() => [userId], [userId]);
  return useRoomMediaCore({ roomId, transport, initialOnlineUserIds });
}
