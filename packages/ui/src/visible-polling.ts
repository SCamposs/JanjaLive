"use client";

import { useEffect } from "react";

// Approval checks stay serial and stop when the page is hidden. Returning to
// the page checks immediately instead of waiting for the next timer.
export function useVisiblePolling(check: (signal: AbortSignal) => void | Promise<void>, enabled: boolean, delay = 3_000) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const schedule = () => {
      if (!controller.signal.aborted && document.visibilityState !== "hidden") timer = setTimeout(run, delay);
    };
    const run = async () => {
      if (controller.signal.aborted || running || document.visibilityState === "hidden") return;
      running = true;
      try { await check(controller.signal); }
      catch { /* The next visible check retries transient failures. */ }
      finally { running = false; schedule(); }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") void run();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [check, delay, enabled]);
}
