"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
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
  return (
    <details className="account-menu">
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
          disabled={signOutDisabled}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut size={15} aria-hidden="true" /> Sair da conta
        </button>
        {signOutDisabled && <small>Encerre o compartilhamento para sair.</small>}
      </div>
    </details>
  );
}
