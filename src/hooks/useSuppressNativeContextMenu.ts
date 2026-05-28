import { useEffect } from "react";

/**
 * Suppresses the native WebView right-click menu app-wide.
 *
 * In a shipped Tauri app the OS/WebView context menu ("Reload / Inspect
 * Element / AutoFill") is useless and looks unfinished, so we swallow the
 * `contextmenu` event at the document level in the capture phase. App-level
 * context menus (file tree, terminal, editor) attach their own `onContextMenu`
 * handlers which still fire — they call `preventDefault()` themselves and open
 * a custom menu, so suppressing the default here does not interfere with them.
 *
 * Text inputs, textareas, and contenteditable regions are exempt so the normal
 * browser editing menu (cut / copy / paste / spelling) stays available where a
 * user would actually expect it.
 */
export function useSuppressNativeContextMenu(): void {
  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      return target.isContentEditable;
    }

    function onContextMenu(e: MouseEvent) {
      // Allow the native editing menu inside editable fields.
      if (isEditable(e.target)) return;
      e.preventDefault();
    }

    // Capture phase so we run before any element-level handler that might
    // otherwise let the default through; app menus still open because their
    // own onContextMenu handlers run in the bubble phase regardless.
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => document.removeEventListener("contextmenu", onContextMenu, true);
  }, []);
}
