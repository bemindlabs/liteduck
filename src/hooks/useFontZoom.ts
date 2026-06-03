/**
 * useFontZoom — global Cmd/Ctrl +/−/0 app zoom shortcuts.
 *
 * Registered once at the app root. Fires regardless of focus (so it works inside
 * the editor and terminal too), mirroring the browser zoom shortcuts:
 *   - Cmd/Ctrl and "=" or "+"  → zoom in
 *   - Cmd/Ctrl and "-"          → zoom out
 *   - Cmd/Ctrl and "0"          → reset to 100%
 */

import { useEffect } from "react";
import { initZoom, zoomIn, zoomOut, resetZoom } from "@/lib/fontZoom";

export function useFontZoom(): void {
  useEffect(() => {
    // Restore the persisted zoom on mount.
    initZoom();

    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      switch (e.key) {
        case "=":
        case "+":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
