import { useSyncExternalStore } from "react";
import {
  getDragging,
  getDragPointer,
  getDragVersion,
  subscribeDrag,
} from "@/lib/internalDrag";

/**
 * Floating label that follows the cursor during an internal pointer drag
 * (see `src/lib/internalDrag.ts`). Mount once near the app root. Renders
 * nothing while no drag is in progress.
 */
export function DragGhost() {
  useSyncExternalStore(subscribeDrag, getDragVersion);
  const dragging = getDragging();
  if (!dragging) return null;
  const { x, y } = getDragPointer();
  return (
    <div
      className="pointer-events-none fixed z-[9999] max-w-[18rem] truncate rounded-sm border border-[var(--color-border)] bg-[var(--color-popover)] px-2 py-0.5 text-xs text-[var(--color-foreground)] shadow-md"
      style={{ left: x + 12, top: y + 8 }}
      aria-hidden
    >
      {dragging.label}
    </div>
  );
}
