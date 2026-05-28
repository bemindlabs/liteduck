/**
 * TerminalDock — collapsible bottom dock that hosts TerminalPage.
 *
 * `TerminalPage` is *always mounted* so PTY sessions survive across panel
 * toggles (the same invariant the old Layout maintained). Collapsing the dock
 * simply hides it via CSS — no unmount.
 *
 * The dock owns the slim VS Code-style header bar (TERMINAL label + new / split
 * / collapse controls) and drives the primary pane through TerminalPage's
 * imperative handle. The page itself only renders the terminal surface.
 */

import { useCallback, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Plus,
  SplitSquareHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TerminalPage, { type TerminalPageHandle } from "@/pages/TerminalPage";

interface TerminalDockProps {
  /** When false, the dock is collapsed and only the header bar is shown. */
  open: boolean;
  onToggle: () => void;
  /**
   * When true, the dock fills the full editor+terminal column (the editor-area
   * slot is hidden by the parent) and the drag-resize height is ignored.
   */
  maximized?: boolean;
  /** Toggle maximize/restore. Maximizing while collapsed opens the dock first. */
  onToggleMaximized?: () => void;
}

const HEADER_HEIGHT = 32;
const MIN_BODY_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.8; // never let the dock eat more than 80% of the column

/** Shared header-button classes — compact, icon-sized, dark-theme tokens. */
const headerBtnCls = cn(
  "flex h-6 w-6 items-center justify-center rounded transition-colors",
  "text-[var(--color-muted-foreground)]",
  "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
  "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-muted-foreground)]",
);

export function TerminalDock({
  open,
  onToggle,
  maximized = false,
  onToggleMaximized,
}: TerminalDockProps) {
  const pageRef = useRef<TerminalPageHandle>(null);

  // User-resizable body height (px). Defaults to a comfortable dock height.
  const [bodyHeight, setBodyHeight] = useState(260);
  const draggingRef = useRef(false);

  // When maximized the dock fills the column via flex-1 (TerminalPane's
  // ResizeObserver re-fits xterm to the new container height). The drag-resize
  // handle is suppressed since the height is no longer user-controlled.
  const expanded = open && maximized;

  const handleNew = useCallback(() => pageRef.current?.newTerminal(), []);
  const handleSplit = useCallback(() => pageRef.current?.splitPrimary("horizontal"), []);

  // Drag the top border to resize the dock taller / shorter. The ResizeObserver
  // inside each TerminalPane re-fits xterm to the new height automatically.
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!open) return;
      e.preventDefault();
      draggingRef.current = true;
      const startY = e.clientY;
      const startHeight = bodyHeight;

      function onMove(ev: MouseEvent) {
        if (!draggingRef.current) return;
        const delta = startY - ev.clientY; // drag up → taller
        const max = Math.max(MIN_BODY_HEIGHT, window.innerHeight * MAX_HEIGHT_RATIO);
        const next = Math.max(MIN_BODY_HEIGHT, Math.min(max, startHeight + delta));
        setBodyHeight(next);
      }

      function onUp() {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [open, bodyHeight],
  );

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden border-t border-[var(--color-border)]",
        "bg-[var(--color-background)]",
        expanded ? "min-h-0 flex-1" : "shrink-0",
      )}
      style={expanded ? undefined : { height: open ? bodyHeight + HEADER_HEIGHT : HEADER_HEIGHT }}
    >
      {/* Resize handle — sits on the top edge; only active when open and not
          maximized (a maximized dock's height is fixed to the full column). */}
      {open && !maximized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal dock"
          onMouseDown={onResizeMouseDown}
          className={cn(
            "absolute inset-x-0 top-0 z-20 h-1 cursor-row-resize",
            "hover:bg-[var(--color-sidebar-primary)] active:bg-[var(--color-sidebar-primary)] transition-colors",
          )}
        />
      )}

      {/* Header bar: TERMINAL label · spacer · new · split · collapse */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 border-b border-[var(--color-border)]",
          "bg-[var(--color-sidebar)] pl-3 pr-1.5",
        )}
        style={{ height: HEADER_HEIGHT }}
      >
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "mr-auto flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider",
            "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors",
          )}
          aria-expanded={open}
          aria-controls="workspace-terminal-dock"
          title={open ? "Collapse terminal (⌘`)" : "Show terminal (⌘`)"}
        >
          <span>Terminal</span>
        </button>

        {open && (
          <>
            <button
              type="button"
              onClick={handleNew}
              className={headerBtnCls}
              aria-label="New terminal"
              title="New terminal"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleSplit}
              className={headerBtnCls}
              aria-label="Split terminal"
              title="Split terminal"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
            </button>
            {onToggleMaximized && (
              <button
                type="button"
                onClick={onToggleMaximized}
                className={headerBtnCls}
                aria-label={maximized ? "Restore panel" : "Maximize panel"}
                aria-pressed={maximized}
                title={maximized ? "Restore panel" : "Maximize panel"}
              >
                {maximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
          </>
        )}

        <button
          type="button"
          onClick={onToggle}
          className={headerBtnCls}
          aria-label={open ? "Collapse terminal" : "Show terminal"}
          title={open ? "Collapse terminal (⌘`)" : "Show terminal (⌘`)"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Body — TerminalPage is always mounted; we hide it when collapsed. */}
      <div
        id="workspace-terminal-dock"
        className={cn("flex-1 min-h-0 overflow-hidden", !open && "invisible")}
        aria-hidden={!open}
      >
        <TerminalPage ref={pageRef} />
      </div>
    </div>
  );
}
