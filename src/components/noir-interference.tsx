import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function NoirInterference({
  children,
  className,
  quote = true,
}: {
  children?: ReactNode;
  className?: string;
  quote?: boolean;
}) {
  return (
    <div className={cn("noir-interference", className)}>
      <div className="noir-interference-image" aria-hidden="true">
        <Image className="noir-frame noir-frame-base" src="/janja-live-noir-2.png" alt="" fill loading="eager" sizes="(max-width: 900px) 100vw, 75vw" />
        <Image className="noir-frame noir-frame-shift noir-frame-shift-a" src="/janja-live-noir-2.png" alt="" fill loading="eager" sizes="(max-width: 900px) 100vw, 75vw" />
        <Image className="noir-frame noir-frame-shift noir-frame-shift-b" src="/janja-live-noir-2.png" alt="" fill loading="eager" sizes="(max-width: 900px) 100vw, 75vw" />
        <span className="noir-scan" />
      </div>
      <div className="noir-interference-content">
        {quote && (
          <blockquote className="noir-quote">
            “A gente precisa retirar imediatamente o Discord do ar”
          </blockquote>
        )}
        {children}
      </div>
    </div>
  );
}
