import { useRef, useCallback, useEffect } from "react";
import { useState } from "react";

// ── useDebouncedSave ──────────────────────────────────────────────────────────

/**
 * Debounced save hook. Accumulates changes and flushes after `delay` ms.
 *
 * - Rapid calls within the window collapse into a single write.
 * - `flush()` forces an immediate save, cancelling any pending timer.
 * - On unmount the pending value is synchronously handed to `saveFn` so no
 *   changes are silently dropped when the component is torn down.
 *
 * @param saveFn - async function called with the latest accumulated value
 * @param delay  - debounce window in ms (default 1000)
 */
export function useDebouncedSave<T>(saveFn: (value: T) => Promise<void>, delay = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);
  // Keep saveFn stable so callers need not memoize it; we read through the ref.
  const saveFnRef = useRef(saveFn);
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const value = pendingRef.current;
      pendingRef.current = null;
      await saveFnRef.current(value);
    }
  }, []);

  const save = useCallback(
    (value: T) => {
      pendingRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, delay);
    },
    [delay, flush],
  );

  // Flush on unmount — synchronous call so the value is not silently dropped
  // even if the component is torn down before the debounce timer fires.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current !== null) {
        void saveFnRef.current(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, []);

  const isPending = useCallback(() => pendingRef.current !== null, []);

  return { save, flush, isPending };
}

// ── useSaveStatus ─────────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Tracks the transient visual state of an auto-save operation.
 *
 * After `markSaved()` the status reverts to `"idle"` after `resetDelay` ms,
 * giving the UI a brief window to show a confirmation indicator.
 */
export function useSaveStatus(resetDelay = 2000) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSaving = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setStatus("saving");
  }, []);

  const markSaved = useCallback(() => {
    setStatus("saved");
    resetTimerRef.current = setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, resetDelay);
  }, [resetDelay]);

  const markError = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setStatus("error");
  }, []);

  // Clear any pending reset timer on unmount.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return { status, markSaving, markSaved, markError };
}
