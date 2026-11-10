"use client";

import { useRef } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";

export function RoomRemovalDialog({ room, open, busy, error, onClose, onConfirm }: {
  room: { name: string; role: "OWNER" | "MEMBER" } | null;
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const owner = room?.role === "OWNER";
  return <AlertDialog.Root open={open} onOpenChange={(open, details) => {
    if (!open) { if (busy) details.cancel(); else onClose(); }
  }}>
    <AlertDialog.Portal>
      <AlertDialog.Backdrop className="jl-confirm-backdrop" />
      <div className="jl-confirm-positioner">
        <AlertDialog.Popup className="jl-confirm-popup" initialFocus={cancelRef} aria-busy={busy}>
          <AlertDialog.Title className="jl-confirm-title">{owner ? "Excluir sala?" : "Remover da minha lista?"}</AlertDialog.Title>
          <AlertDialog.Description className="jl-confirm-description">
            {owner ? <>A sala <strong>{room?.name}</strong> será excluída para todos. Essa ação não pode ser desfeita.</>
              : <>Você perderá o acesso à sala <strong>{room?.name}</strong>. Para voltar, precisará entrar novamente conforme as regras de acesso da sala.</>}
          </AlertDialog.Description>
          {error && <p className="jl-confirm-error" role="alert">{error}</p>}
          <div className="jl-confirm-actions">
            <AlertDialog.Close ref={cancelRef} className="jl-confirm-cancel" disabled={busy}>Cancelar</AlertDialog.Close>
            <button className="jl-confirm-submit" type="button" disabled={busy} onClick={onConfirm}>
              {busy ? (owner ? "Excluindo…" : "Removendo…") : owner ? "Excluir sala" : "Remover da lista"}
            </button>
          </div>
        </AlertDialog.Popup>
      </div>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
