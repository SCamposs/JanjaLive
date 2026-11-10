import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NoirImageLayers } from "./noir-image-layers";

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
      <NoirImageLayers />
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
