import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

/**
 * Pointer-based internal drag-and-drop.
 *
 * HTML5 drag-and-drop does not fire inside the webview while Tauri's native
 * file-drop handler is enabled (`dragDropEnabled = true`, the window default —
 * and required so external Finder/Explorer drops deliver real filesystem paths
 * via `onDragDropEvent`). That global handler swallows the webview's HTML5
 * drag/drop events, so *internal* drags (file tree → terminal, file tree →
 * folder) need a mouse-driven replacement.
 *
 * Model: a drag source records its payload on press-and-move past a small
 * threshold; a floating ghost (see `DragGhost`) follows the cursor; drop zones
 * are resolved on release via `document.elementFromPoint` walking up to the
 * nearest registered zone. External OS drops are unaffected and keep flowing
 * through Tauri's native event.
 */

export interface InternalDragData {
  /**
   * Drag category, so a drop zone only accepts compatible drags. Without this a
   * tab drag (whose payload is the file path) would be accepted by the folder /
   * terminal file drop zones. e.g. "file" | "tab".
   */
  kind: string;
  /** Payload value(s) — filesystem path(s) for files, the tab id for tabs. */
  paths: string[];
  /** Short label rendered in the drag ghost. */
  label: string;
}

type DropHandler = (paths: string[]) => void;
type CanDrop = (paths: string[]) => boolean;

export interface DropZoneOptions {
  /** Only accept drags of this kind (matches InternalDragData.kind). */
  accept?: string;
  /** Reject specific payloads (also hides the over-highlight). */
  canDrop?: CanDrop;
}

interface Zone {
  el: HTMLElement;
  onDrop: DropHandler;
  accept?: string;
  canDrop: CanDrop;
}

const zones = new Set<Zone>();
const subscribers = new Set<() => void>();

let dragging: InternalDragData | null = null;
let pointer = { x: 0, y: 0 };
let overEl: HTMLElement | null = null;
let version = 0;

function emit() {
  version += 1;
  for (const fn of subscribers) fn();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Live getters for the ghost renderer (avoids importing module-private state). */
export function getDragVersion(): number {
  return version;
}
export function getDragging(): InternalDragData | null {
  return dragging;
}
export function getDragPointer(): { x: number; y: number } {
  return pointer;
}
export { subscribe as subscribeDrag };

/** Topmost registered drop zone under (x, y) that accepts the drag. */
function resolveZone(x: number, y: number, data: InternalDragData): Zone | null {
  let node = document.elementFromPoint(x, y) as HTMLElement | null;
  while (node) {
    for (const zone of zones) {
      if (zone.el !== node) continue;
      if (zone.accept && zone.accept !== data.kind) continue;
      if (zone.canDrop(data.paths)) return zone;
    }
    node = node.parentElement;
  }
  return null;
}

const DRAG_THRESHOLD = 5;

function beginPress(startX: number, startY: number, getData: () => InternalDragData | null) {
  // Non-null once the press passes the threshold and the drag goes active.
  let data: InternalDragData | null = null;

  const onMove = (e: MouseEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (!data) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      const next = getData();
      if (!next || next.paths.length === 0) {
        cleanup();
        return;
      }
      data = next;
      dragging = next;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }
    overEl = resolveZone(e.clientX, e.clientY, data)?.el ?? null;
    emit();
  };

  const onUp = (e: MouseEvent) => {
    if (data) {
      const zone = resolveZone(e.clientX, e.clientY, data);
      if (zone) zone.onDrop(data.paths);
    }
    cleanup();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.removeEventListener("keydown", onKey, true);
    const wasActive = data !== null;
    data = null;
    dragging = null;
    overEl = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (wasActive) emit();
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);
  document.addEventListener("keydown", onKey, true);
}

/**
 * Mark an element as a drag source. Returns an `onMouseDown` handler to spread
 * onto the element. `getData` is read lazily once the press passes the drag
 * threshold (return `null` to abort the drag).
 */
export function useDragSource(getData: () => InternalDragData | null): {
  onMouseDown: (e: ReactMouseEvent) => void;
} {
  const getDataRef = useRef(getData);
  useEffect(() => {
    getDataRef.current = getData;
  }, [getData]);
  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return; // primary button only
    beginPress(e.clientX, e.clientY, () => getDataRef.current());
  }, []);
  return { onMouseDown };
}

/**
 * Register `ref`'s element as a drop zone. `onDrop` fires with the dragged
 * paths when a drag is released over it; `canDrop` (optional) can reject a
 * payload (also hides the over-highlight). Returns whether a compatible drag is
 * currently hovering this zone.
 */
export function useDropZone(
  ref: RefObject<HTMLElement | null>,
  onDrop: DropHandler,
  options?: DropZoneOptions,
): boolean {
  const onDropRef = useRef(onDrop);
  const canDropRef = useRef(options?.canDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
    canDropRef.current = options?.canDrop;
  });

  const accept = options?.accept;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const zone: Zone = {
      el,
      accept,
      onDrop: (paths) => onDropRef.current(paths),
      canDrop: (paths) => (canDropRef.current ? canDropRef.current(paths) : true),
    };
    zones.add(zone);
    return () => {
      zones.delete(zone);
    };
  }, [ref, accept]);

  return useSyncExternalStore(
    subscribe,
    () => dragging !== null && overEl === ref.current,
  );
}
