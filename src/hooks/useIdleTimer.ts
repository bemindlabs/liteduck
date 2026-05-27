import { useEffect, useRef, useCallback } from "react";

const IDLE_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;

/**
 * Calls `onIdle()` after `timeoutMs` milliseconds of user inactivity.
 * Resets the timer on any mouse/keyboard/touch/scroll event.
 *
 * Pass `enabled = false` to disable the timer entirely (e.g. when biometric
 * is not turned on).
 */
export function useIdleTimer(onIdle: () => void, timeoutMs: number, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start the timer initially.
    resetTimer();

    // Reset on any user interaction.
    for (const event of IDLE_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of IDLE_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [enabled, resetTimer]);
}
