"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function UserAvatar({
  name,
  image,
  size = 28,
  className,
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = name.trim().slice(0, 1).toLocaleUpperCase("pt-BR") || "?";

  if (!image || imageFailed) {
    return (
      <span
        aria-hidden="true"
        className={cn("user-avatar fallback", className)}
        style={{ width: size, height: size }}
      >
        {initial}
      </span>
    );
  }

  return (
    <Image
      alt=""
      className={cn("user-avatar", className)}
      height={size}
      onError={() => setImageFailed(true)}
      src={image}
      width={size}
    />
  );
}
