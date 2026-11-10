"use client";

import Image from "next/image";
import { useDecorativeImageState } from "@janjalive/ui/decorative-image";

export function NoirImageLayers() {
  const { state, imageRef, onLoad, onError } = useDecorativeImageState();
  const image = { src: "/janja-live-noir-2.webp", fill: true, loading: "eager", sizes: "(max-width: 900px) 100vw, 75vw", onError } as const;
  return <div className="noir-interference-image" data-image-state={state} aria-hidden="true">
    {state !== "failed" && <Image {...image} alt="" ref={imageRef} onLoad={onLoad} className="noir-frame noir-frame-base" />}
    {state === "ready" && <>
      <Image {...image} alt="" className="noir-frame noir-frame-shift noir-frame-shift-a" />
      <Image {...image} alt="" className="noir-frame noir-frame-shift noir-frame-shift-b" />
      <span className="noir-scan" />
    </>}
  </div>;
}
