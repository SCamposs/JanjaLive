import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand brand-link" href="/" aria-label="Voltar ao início do JanjaLive">
      <Image
        className={cn("brand-mark", compact && "brand-mark-compact")}
        src="/janja-live.png"
        width={compact ? 42 : 38}
        height={compact ? 30 : 28}
        alt=""
        priority
      />
      <span className={cn("brand-name", compact && "brand-name-compact")}>JanjaLive</span>
    </Link>
  );
}
