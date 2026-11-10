import { useDecorativeImageState } from "@janjalive/ui/decorative-image";

export function DesktopNoirBackdrop({ image = "/janja-live-noir.webp" }: { image?: string }) {
  return <DesktopNoirLayers key={image} image={image} />;
}

function DesktopNoirLayers({ image }: { image: string }) {
  const { state, imageRef, onLoad, onError } = useDecorativeImageState();
  return <div className="desktop-noir-backdrop" data-image-state={state} aria-hidden="true">
    {state !== "failed" && <img className="desktop-noir-frame desktop-noir-frame-base" src={image} alt="" ref={imageRef} onLoad={onLoad} onError={onError} />}
    {state === "ready" && <>
      <img className="desktop-noir-frame desktop-noir-frame-shift desktop-noir-frame-shift-a" src={image} alt="" onError={onError} />
      <img className="desktop-noir-frame desktop-noir-frame-shift desktop-noir-frame-shift-b" src={image} alt="" onError={onError} />
      <span className="desktop-noir-scan" />
    </>}
  </div>;
}
