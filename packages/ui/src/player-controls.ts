"use client";
import { useCallback, useEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent } from "react";
const PLAYER_CONTROLS_HIDE_DELAY_MS = 2_500;

export function usePlayerControlsAutoHide() {
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), PLAYER_CONTROLS_HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return clearHideTimer;
  }, [clearHideTimer, scheduleHide]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (event.target instanceof Element && event.target.closest("[data-player-controls]")) {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }
    showControls();
  }, [clearHideTimer, showControls]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      showControls();
      return;
    }
    clearHideTimer();
    if (event.target instanceof Element && event.target.closest("[data-player-controls]")) {
      setControlsVisible(true);
      scheduleHide();
      return;
    }
    setControlsVisible(true);
    scheduleHide();
  }, [clearHideTimer, scheduleHide, showControls]);

  const handleBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) scheduleHide();
  }, [scheduleHide]);

  return {
    controlsVisible,
    showControls,
    containerProps: {
      onPointerEnter: showControls,
      onPointerMove: handlePointerMove,
      onPointerDownCapture: handlePointerDown,
      onTouchStartCapture: showControls,
      onPointerLeave: scheduleHide,
      onFocusCapture: () => {
        clearHideTimer();
        setControlsVisible(true);
      },
      onBlurCapture: handleBlur,
    },
    controlsProps: {
      onPointerEnter: () => {
        clearHideTimer();
        setControlsVisible(true);
      },
      onPointerLeave: scheduleHide,
    },
  };
}
