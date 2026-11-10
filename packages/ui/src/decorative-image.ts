"use client";

import { useCallback, useState } from "react";

export function useDecorativeImageState() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    // A cached image may have finished before hydration attached its handlers.
    if (image?.complete) setState(image.naturalWidth > 0 ? "ready" : "failed");
  }, []);
  const onLoad = useCallback(() => setState("ready"), []);
  const onError = useCallback(() => setState("failed"), []);
  return { state, imageRef, onLoad, onError };
}
