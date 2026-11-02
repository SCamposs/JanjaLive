"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserAvatar } from "./user-avatar";

export function AccountMenu({
  name,
  image,
  compact = false,
  signOutDisabled = false,
}: {
  name: string;
  image?: string | null;
  compact?: boolean;
  signOutDisabled?: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key !== "Escape" : event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (menuRef.current) menuRef.current.open = false;
      setConfirmAll(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  async function signOutEverywhere() {
    if (!confirmAll) { setConfirmAll(true); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/sessions", { method: "DELETE" });
      // Credentials are already invalidated if transport revocation needs retry.
      if (response.ok || response.status === 401 || (response.status === 503 && (await response.json()).error === "ACCESS_REVOCATION_INCOMPLETE")) {
        await signOut({ callbackUrl: "/" });
      } else throw new Error("SESSION_REVOCATION_FAILED");
    } catch { setError("Não foi possível concluir. Tente novamente."); setBusy(false); }
  }
  return (
    <details className="account-menu" ref={menuRef} onToggle={(event) => { if (!event.currentTarget.open) setConfirmAll(false); }}>
      <summary
        className={compact ? "avatar-button account-summary compact" : "signed-user account-summary"}
        aria-label={compact ? `Conta de ${name}` : undefined}
      >
        <UserAvatar image={image} name={name} size={compact ? 30 : 28} />
        {!compact && <><span>{name}</span><ChevronDown size={14} aria-hidden="true" /></>}
      </summary>
      <div className="account-popover">
        <strong>{name}</strong>
        <button
          type="button"
          disabled={signOutDisabled || busy}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut size={15} aria-hidden="true" /> Sair da conta
        </button>
        <button type="button" disabled={signOutDisabled || busy} onClick={() => void signOutEverywhere()}>
          <LogOut size={15} aria-hidden="true" /> {busy ? "Encerrando sessões…" : confirmAll ? "Confirmar saída de todos" : "Sair de todos os dispositivos"}
        </button>
        {confirmAll && !busy && <small>Inclui este navegador e os aplicativos desktop.</small>}
        {error && <small role="alert">{error}</small>}
        <Link href="/safety">Privacidade e denúncia</Link>
        {signOutDisabled && <small>Encerre o compartilhamento para sair.</small>}
      </div>
    </details>
  );
}
