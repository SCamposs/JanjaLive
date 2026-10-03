import { useMemo } from "react";
import { useRoomMediaCore, type RoomMediaTransport } from "@janjalive/webrtc";

export function useRoomMedia(roomId: string | null) {
  const transport = useMemo<RoomMediaTransport>(() => ({
    send: (targetRoomId, signal) => window.janja.realtime.send(targetRoomId, signal),
    poll: (targetRoomId, since) => window.janja.realtime.poll(targetRoomId, since),
    getIceServers: (targetRoomId) => window.janja.realtime.getIceServers(targetRoomId),
    isRoomUnavailable(error) {
      return String(error).includes("API_403") || String(error).includes("API_404");
    },
  }), []);

  return useRoomMediaCore({ roomId, transport });
}
