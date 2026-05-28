/**
 * SidePanel — the resizable column between the activity rail and the editor.
 *
 * Renders the appropriate panel body for the active panel:
 *   - files → FilesTreePanel (tree only; editor area handles the preview)
 *   - git   → GitPage (its own self-contained UI)
 *
 * For settings / notifications the shell does not render the SidePanel at all
 * (those routes own the full editor area via Outlet); the rail icon highlights
 * via `activePanel` state, but no side column is shown.
 *
 * Width is user-adjustable via the drag handle on its right edge.
 */

import { lazy, Suspense, useRef } from "react";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/ui/skeleton";
import type { FileEntry } from "@/lib/files";
import type { WorkspacePanel } from "@/lib/routes";
import { FilesTreePanel } from "./FilesTreePanel";

// GitPage is heavy (multi-repo scan, large tabs) — keep lazy.
const GitPage = lazy(() => import("@/pages/GitPage"));

interface SidePanelProps {
  panel: WorkspacePanel;
  width: number;
  onResize: (width: number) => void;
  /** Active file in the editor (for tree highlight). */
  selectedFilePath: string | null;
  /** Opens a file in the editor area (adds a tab). */
  onFileOpen: (entry: FileEntry) => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;

export function SidePanel({
  panel,
  width,
  onResize,
  selectedFilePath,
  onFileOpen,
}: SidePanelProps) {
  const dragging = useRef(false);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    // The rail is 48px (w-12). Subtract it so the user's cursor matches the
    // visual width of the panel (the rail is to the left of the panel).
    const offset = 48;

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, ev.clientX - offset));
      onResize(next);
    }

    function onMouseUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <aside
      aria-label={`${panel} panel`}
      className="flex h-full shrink-0"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <div className="flex-1 min-w-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-background)]">
        {panel === "files" && (
          <FilesTreePanel selectedPath={selectedFilePath} onFileOpen={onFileOpen} />
        )}

        {panel === "git" && (
          <Suspense fallback={<PageLoading />}>
            <div className="h-full overflow-y-auto">
              <GitPage />
            </div>
          </Suspense>
        )}
      </div>

      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onMouseDown={onMouseDown}
        className={cn(
          "w-1 shrink-0 cursor-col-resize bg-[var(--color-border)]",
          "hover:bg-[var(--color-secondary)] active:bg-[var(--color-primary)] transition-colors",
        )}
      />
    </aside>
  );
}
