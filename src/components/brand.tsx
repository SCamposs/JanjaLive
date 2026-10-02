import Image from "next/image";
import { cn } from "@/lib/cn";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="JanjaLive">
      <Image className="brand-mark" src="/janja-live.png" width={28} height={28} alt="" priority />
      <span className={cn("brand-name", compact && "brand-name-compact")}>JanjaLive</span>
    </div>
  );
}
