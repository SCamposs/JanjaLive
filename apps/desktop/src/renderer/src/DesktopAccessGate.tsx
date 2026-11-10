import { useCallback, useState } from "react";
import { useVisiblePolling } from "@janjalive/ui";
import type { RoomSnapshot } from "../../shared/contracts";

export function DesktopAccessGate({ room, onRequest, onUpdate }: { room: RoomSnapshot; onRequest: () => Promise<void>; onUpdate: (room: RoomSnapshot) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkApproval = useCallback(async (signal: AbortSignal) => {
    const next = await window.janja.rooms.getPublic(room.room.publicId);
    if (!signal.aborted) onUpdate(next);
  }, [onUpdate, room.room.publicId]);
  useVisiblePolling(checkApproval, room.access === "pending");
  async function requestAccess() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await onRequest(); }
    catch { setError("Não foi possível enviar a solicitação. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="desktop-login">
    <h1>{room.room.name}</h1>
    <p>{room.access === "pending" ? "Aguardando aprovação do dono da sala." : room.access === "rejected" ? "Seu pedido não foi aceito. Você pode solicitar novamente." : "Você precisa de aprovação para entrar."}</p>
    {room.access !== "pending" && <button className="primary-button" type="button" disabled={busy} onClick={() => void requestAccess()}>{busy ? "Enviando…" : "Solicitar acesso"}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
