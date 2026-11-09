"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Menu } from "@janjalive/ui";
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
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <Menu.Root onOpenChange={(open) => { if (!open) setConfirmAll(false); }}>
      <Menu.Trigger
        className={compact ? "avatar-button account-summary compact" : "signed-user account-summary"}
        aria-label={`Conta de ${name}`}
      >
        <UserAvatar image={image} name={name} size={compact ? 30 : 28} />
        {!compact && <><span>{name}</span><ChevronDown size={14} aria-hidden="true" /></>}
      </Menu.Trigger>
      <Menu.Portal><Menu.Positioner sideOffset={8} align="end" collisionPadding={10} className="jl-menu-positioner"><Menu.Popup className="jl-menu-popup account-popover">
        <strong>{name}</strong>
        <Menu.Item render={<button type="button" />} nativeButton closeOnClick={false}
          disabled={signOutDisabled || busy}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut size={15} aria-hidden="true" /> Sair da conta
        </Menu.Item>
        <Menu.Item render={<button type="button" />} nativeButton closeOnClick={false} disabled={signOutDisabled || busy} onClick={() => void signOutEverywhere()}>
          <LogOut size={15} aria-hidden="true" /> {busy ? "Encerrando sessões…" : confirmAll ? "Confirmar saída de todos" : "Sair de todos os dispositivos"}
        </Menu.Item>
        {confirmAll && !busy && <small>Inclui este navegador e os aplicativos desktop.</small>}
        {error && <small role="alert">{error}</small>}
        <Menu.Item render={<Link href="/safety" />}>Privacidade e denúncia</Menu.Item>
        {signOutDisabled && <small>Encerre o compartilhamento para sair.</small>}
      </Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>
  );
}
