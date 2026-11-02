"use client";

import { ArrowUpRight, Clock3, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AvailableRoom } from "@/lib/rooms";
import { RoomRemovalDialog } from "@janjalive/ui/room-removal-dialog";

function expiryLabel(remainingMs: number) {
  const hours = Math.ceil(remainingMs / (60 * 60 * 1_000));
  if (hours <= 1) return "Expira em menos de 1 hora";
  if (hours < 24) return `Expira em ${hours} horas`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Expira amanhã" : `Expira em ${days} dias`;
}

export function RoomList({ rooms }: { rooms: AvailableRoom[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AvailableRoom | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!rooms.length) {
    return <p className="room-list-empty">Nenhuma sala disponível.</p>;
  }

  async function removeRoom() {
    if (!selected || deletingId) return;
    const roomId = selected.id;
    const owner = selected.role === "OWNER";
    setDeletingId(roomId);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}${owner ? "" : "/membership"}`, { method: "DELETE" });
      if (!response.ok) throw new Error("DELETE_FAILED");
      setDialogOpen(false);
      router.refresh();
    } catch {
      setError(owner ? "Não foi possível excluir a sala. Tente novamente." : "Não foi possível concluir a remoção. Tente novamente.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="available-room-list">
        {rooms.map((room) => {
          return (
            <article className="available-room" data-confirming={dialogOpen && selected?.id === room.id} data-owner={room.role === "OWNER"} key={room.id}>
              <Link className="available-room-link" href={`/join/${room.publicId}`}>
                <div>
                  <strong>{room.name}</strong>
                  <span>{room.role === "OWNER" ? "Criada por você" : "Acesso autorizado"}</span>
                </div>
                <span className="room-expiry"><Clock3 size={13} /> {expiryLabel(room.expiresInMs)}</span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <button className="room-delete-trigger" type="button" onClick={() => { setSelected(room); setError(null); setDialogOpen(true); }} aria-label={room.role === "OWNER" ? `Excluir ${room.name}` : `Remover ${room.name} da minha lista`}>
                {room.role === "OWNER" ? <Trash2 size={14} /> : <LogOut size={14} />}
              </button>
            </article>
          );
        })}
      </div>
      <RoomRemovalDialog room={selected} open={dialogOpen} busy={deletingId !== null} error={error} onClose={() => setDialogOpen(false)} onConfirm={() => void removeRoom()} />
    </>
  );
}
