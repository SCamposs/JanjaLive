import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export function AdminShortcut() {
  return (
    <Link className="icon-button" href="/admin" aria-label="Abrir controle de acesso" title="Controle de acesso">
      <ShieldCheck size={18} aria-hidden="true" />
    </Link>
  );
}
