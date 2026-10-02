"use client";

import { useEffect } from "react";

export function DesktopAuthComplete({ deepLink }: { deepLink: string }) {
  useEffect(() => {
    window.location.assign(deepLink);
  }, [deepLink]);

  return (
    <a className="button primary wide" href={deepLink} rel="noreferrer">
      Abrir JanjaLive
    </a>
  );
}
