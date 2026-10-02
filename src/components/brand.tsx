import Image from "next/image";
import { cn } from "@/lib/cn";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="JanjaLive">
      <Image
        className={cn("brand-mark", compact && "brand-mark-compact")}
        src="/janja-live.png"
        width={compact ? 32 : 28}
        height={compact ? 32 : 28}
        alt=""
        priority
      />
      <span className={cn("brand-name", compact && "brand-name-compact")}>JanjaLive</span>
    </div>
  );
}
