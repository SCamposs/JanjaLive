import { ArrowUpRight, Clock3 } from "lucide-react";
import Link from "next/link";
import type { AvailableRoom } from "@/lib/rooms";

function expiryLabel(remainingMs: number) {
  const hours = Math.ceil(remainingMs / (60 * 60 * 1_000));
  if (hours <= 1) return "Expira em menos de 1 hora";
  if (hours < 24) return `Expira em ${hours} horas`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Expira amanhã" : `Expira em ${days} dias`;
}

export function RoomList({ rooms }: { rooms: AvailableRoom[] }) {
  if (!rooms.length) {
    return <p className="room-list-empty">Nenhuma sala disponível.</p>;
  }

  return (
    <div className="available-room-list">
      {rooms.map((room) => (
        <Link className="available-room" href={`/join/${room.publicId}`} key={room.id}>
          <div>
            <strong>{room.name}</strong>
            <span>{room.role === "OWNER" ? "Criada por você" : "Acesso autorizado"}</span>
          </div>
          <span className="room-expiry"><Clock3 size={13} /> {expiryLabel(room.expiresInMs)}</span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
