"use client";

import { ArrowUpRight, Check, Clock3, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AvailableRoom } from "@/lib/rooms";
import { Toast } from "./toast";

function expiryLabel(remainingMs: number) {
  const hours = Math.ceil(remainingMs / (60 * 60 * 1_000));
  if (hours <= 1) return "Expira em menos de 1 hora";
  if (hours < 24) return `Expira em ${hours} horas`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Expira amanhã" : `Expira em ${days} dias`;
}

export function RoomList({ rooms }: { rooms: AvailableRoom[] }) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!rooms.length) {
    return <p className="room-list-empty">Nenhuma sala disponível.</p>;
  }

  async function removeRoom(roomId: string) {
    setDeletingId(roomId);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("DELETE_FAILED");
      setConfirmingId(null);
      router.refresh();
    } catch {
      setError("Não foi possível excluir a sala.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="available-room-list">
        {rooms.map((room) => {
          const confirming = confirmingId === room.id;
          const deleting = deletingId === room.id;
          return (
            <article className="available-room" data-confirming={confirming} data-owner={room.role === "OWNER"} key={room.id}>
              <Link className="available-room-link" href={`/join/${room.publicId}`}>
                <div>
                  <strong>{room.name}</strong>
                  <span>{room.role === "OWNER" ? "Criada por você" : "Acesso autorizado"}</span>
                </div>
                <span className="room-expiry"><Clock3 size={13} /> {expiryLabel(room.expiresInMs)}</span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              {room.role === "OWNER" && (confirming ? (
                <div className="room-delete-confirmation" aria-label="Confirmar exclusão da sala">
                  <button type="button" onClick={() => setConfirmingId(null)} disabled={deleting} aria-label="Cancelar exclusão"><X size={14} /></button>
                  <button className="confirm" type="button" onClick={() => void removeRoom(room.id)} disabled={deleting} aria-label="Excluir sala agora"><Check size={14} /></button>
                </div>
              ) : (
                <button className="room-delete-trigger" type="button" onClick={() => setConfirmingId(room.id)} aria-label={`Excluir ${room.name}`}><Trash2 size={14} /></button>
              ))}
            </article>
          );
        })}
      </div>
      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </>
  );
}
