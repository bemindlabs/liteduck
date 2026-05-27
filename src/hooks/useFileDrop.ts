import { useEffect, useRef, useState, type RefObject } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Hook that adds drag-and-drop file/directory support to an input element.
 * When a file or directory is dropped onto the input, its absolute path is
 * passed to `onDrop`. Visual drag-over feedback is managed via the returned
 * `isDragOver` flag.
 *
 * Uses Tauri's `onDragDropEvent` for full native paths — HTML5 DataTransfer
 * does not expose file-system paths inside Tauri webviews.
 */
export function useFileDrop(onDrop: (path: string) => void): {
  ref: RefObject<HTMLElement | null>;
  isDragOver: boolean;
} {
  const ref = useRef<HTMLElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // --- HTML5 drag events for visual feedback & preventing default ---
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };
    // Prevent the browser's default drop behavior (opening the file).
    const onHTMLDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onHTMLDrop);

    // --- Tauri native drag-drop for actual file paths ---
    let cancelled = false;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (cancelled) return;
      const payload = event.payload;

      if (payload.type === "drop" && payload.paths.length > 0) {
        // Check if the drop target overlaps our element.
        const rect = el.getBoundingClientRect();
        const { x, y } = payload.position;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          onDropRef.current(payload.paths[0]);
          setIsDragOver(false);
        }
      }

      if (payload.type === "leave") {
        setIsDragOver(false);
      }
    });

    return () => {
      cancelled = true;
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onHTMLDrop);
      void unlisten.then((fn) => fn());
    };
  }, []);

  return { ref, isDragOver };
}

/**
 * Tailwind classes applied to an input when a file is being dragged over it.
 */
export const FILE_DROP_ACTIVE_CLASS =
  "ring-2 ring-[var(--color-primary)] border-[var(--color-primary)] bg-[var(--color-primary)]/5";
