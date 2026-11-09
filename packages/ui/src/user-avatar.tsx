"use client";

import { Avatar } from "@base-ui/react/avatar";
import type { ReactElement } from "react";

export function UserAvatar({ name, image, size = 28, className = "", imageElement }: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
  imageElement?: ReactElement;
}) {
  const initial = Array.from(name.trim().normalize("NFC"))[0]?.toLocaleUpperCase("pt-BR") || "?";

  return <Avatar.Root
    key={image || ""}
    aria-hidden="true"
    className={`jl-user-avatar ${className}`}
    style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
  >
    {image && <Avatar.Image
      src={image}
      alt=""
      keepMounted
      render={imageElement}
      className={(state) => `jl-user-avatar-image${state.imageLoadingStatus === "loaded" ? " is-loaded" : ""}`}
    />}
    <Avatar.Fallback className="jl-user-avatar-fallback">{initial}</Avatar.Fallback>
  </Avatar.Root>;
}
