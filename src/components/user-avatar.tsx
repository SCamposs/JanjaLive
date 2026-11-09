"use client";

import Image from "next/image";
import { UserAvatar as SharedUserAvatar } from "@janjalive/ui";
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
  return <SharedUserAvatar
    name={name}
    image={image}
    size={size}
    className={cn("user-avatar", className)}
    imageElement={image ? <Image src={image} alt="" width={size} height={size} /> : undefined}
  />;
}
