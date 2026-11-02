import { useState } from "react";
import { Trash2 } from "lucide-react";
import { TooltipButton } from "@janjalive/ui";
import { RoomRemovalDialog } from "@janjalive/ui/room-removal-dialog";

export function DesktopDeleteRoomAction({ room, onDeleted }: { room: { id: string; name: string }; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.janja.rooms.delete(room.id);
      setOpen(false);
      onDeleted();
    } catch {
      setError("Não foi possível excluir a sala. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <TooltipButton tooltip="Excluir sala" aria-label="Excluir sala" className="danger-control" type="button" onClick={() => { setError(null); setOpen(true); }}><Trash2 size={15} /></TooltipButton>
    <RoomRemovalDialog room={{ ...room, role: "OWNER" }} open={open} busy={busy} error={error} onClose={() => setOpen(false)} onConfirm={() => void remove()} />
  </>;
}
