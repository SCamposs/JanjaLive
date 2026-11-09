import { useEffect, useState } from "react";
import type { RoomSnapshot } from "../../shared/contracts";

export function DesktopAccessGate({ room, onRequest, onUpdate }: { room: RoomSnapshot; onRequest: () => Promise<void>; onUpdate: (room: RoomSnapshot) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (room.access !== "pending") return;
    let stopped = false;
    const interval = setInterval(() => {
      void window.janja.rooms.getPublic(room.room.publicId).then((next) => {
        if (!stopped) onUpdate(next);
      }).catch(() => undefined);
    }, 3_000);
    return () => { stopped = true; clearInterval(interval); };
  }, [onUpdate, room.access, room.room.publicId]);
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
