export function DesktopNoirBackdrop({ image = "/janja-live-noir.png" }: { image?: string }) {
  return <div className="desktop-noir-backdrop" aria-hidden="true"><img className="desktop-noir-frame desktop-noir-frame-base" src={image} alt="" /><img className="desktop-noir-frame desktop-noir-frame-shift desktop-noir-frame-shift-a" src={image} alt="" /><img className="desktop-noir-frame desktop-noir-frame-shift desktop-noir-frame-shift-b" src={image} alt="" /><span className="desktop-noir-scan" /></div>;
}
