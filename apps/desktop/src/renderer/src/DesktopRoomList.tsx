import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { RoomRemovalDialog } from "@janjalive/ui/room-removal-dialog";
import type { RoomSummary } from "../../shared/contracts";

function expiryLabel(remainingMs: number) {
  const hours = Math.ceil(remainingMs / (60 * 60 * 1_000));
  if (hours <= 1) return "Expira em menos de 1 hora";
  if (hours < 24) return `Expira em ${hours} horas`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Expira amanhã" : `Expira em ${days} dias`;
}

export function DesktopRoomList({ rooms, onOpen, onRefresh }: {
  rooms: RoomSummary[];
  onOpen: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<RoomSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeRoom() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.role === "OWNER") await window.janja.rooms.delete(selected.id);
      else await window.janja.rooms.leave(selected.id);
      setOpen(false);
      await onRefresh();
    } catch {
      setError(selected.role === "OWNER" ? "Não foi possível excluir a sala. Tente novamente." : "Não foi possível concluir a remoção. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="room-list-card" aria-label="Salas disponíveis">
      {rooms.length ? rooms.map((room) => <article className="desktop-room-row" data-confirming={open && selected?.id === room.id} key={room.id}>
        <button className="desktop-room-open" type="button" onClick={() => void onOpen(room.id)}>
          <span><strong>{room.name}</strong><small>{room.role === "OWNER" ? "Sua sala" : "Membro"} · {expiryLabel(room.expiresInMs)}</small></span><b>Abrir</b>
        </button>
        <button className="desktop-room-remove" type="button" aria-label={room.role === "OWNER" ? `Excluir ${room.name}` : `Remover ${room.name} da minha lista`} onClick={() => { setSelected(room); setError(null); setOpen(true); }}>
          {room.role === "OWNER" ? <Trash2 size={14} /> : <LogOut size={14} />}
        </button>
      </article>) : <p>Nenhuma sala disponível.</p>}
    </section>
    <RoomRemovalDialog room={selected} open={open} busy={busy} error={error} onClose={() => setOpen(false)} onConfirm={() => void removeRoom()} />
  </>;
}
