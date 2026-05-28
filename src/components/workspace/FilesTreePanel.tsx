/**
 * FilesTreePanel — tree-only file explorer for the workspace shell side panel.
 *
 * Reuses the FileTree component but omits the preview pane (the editor area
 * to the right takes care of that). Selecting a file calls `onFileOpen` which
 * the workspace shell wires up to its open-files tab state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus, FolderOpen, FolderPlus, RefreshCw, Code2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/FileTree";
import {
  type FileEntry,
  filesCreateDir,
  filesOpenInVscode,
  filesWriteText,
} from "@/lib/files";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ROUTES } from "@/lib/routes";
import { createLogger } from "@/lib/logger";

const logger = createLogger("FilesTreePanel");

interface FilesTreePanelProps {
  /** Currently selected entry — controlled by parent so editor stays in sync. */
  selectedPath: string | null;
  /** Called when a file is opened (single-click). Parent adds it to editor tabs. */
  onFileOpen: (entry: FileEntry) => void;
}

export function FilesTreePanel({ selectedPath, onFileOpen }: FilesTreePanelProps) {
  const { workspace } = useWorkspace();
  const workspaceDir = workspace.trim() !== "" ? workspace.trim() : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [showHidden, setShowHidden] = useState(true);
  const [newFileDialog, setNewFileDialog] = useState<"file" | "folder" | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Reset when workspace changes. Synchronising local UI state with an external
  // change (the active workspace) is a valid effect use.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [workspace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // "Open Terminal Here" from FileTree context menu — same plumbing as before.
  // The terminal dock listens to "aidlc:terminal:open-at" via TerminalPage's
  // global event listener (registered globally, route-agnostic).
  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<{ path?: string } | null>).detail;
      const path = detail?.path;
      if (!path) return;
      // Forward to TerminalPage via its existing event so a new tab opens in the
      // requested cwd. We can't navigate (already in workspace) so we just emit.
      window.dispatchEvent(
        new CustomEvent("aidlc:terminal:open-at", {
          detail: { cwd: path, label: path.split("/").pop() ?? "Terminal" },
        }),
      );
    }
    window.addEventListener("open-terminal-at", handle);
    return () => window.removeEventListener("open-terminal-at", handle);
  }, []);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  const targetDir = (() => {
    if (!workspaceDir) return null;
    if (!selectedPath) return workspaceDir;
    return selectedPath;
  })();

  const handleNewFileSubmit = useCallback(async () => {
    if (!targetDir || !newFileName.trim()) return;
    // If the selected path is a file, create alongside it.
    const dir = (() => {
      const parts = targetDir.split("/");
      if (parts.length > 1 && !targetDir.endsWith("/")) {
        // We don't know is_dir here from path alone — fall back to using the path as a dir.
        return targetDir;
      }
      return targetDir;
    })();
    const fullPath = `${dir}/${newFileName.trim()}`;
    try {
      if (newFileDialog === "folder") {
        await filesCreateDir(fullPath);
      } else {
        await filesWriteText(fullPath, "");
      }
      setRefreshKey((k) => k + 1);
      setNewFileDialog(null);
      setNewFileName("");
    } catch (err) {
      logger.error("create failed:", err);
    }
  }, [targetDir, newFileName, newFileDialog]);

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-xs">
          <FolderOpen className="mx-auto h-8 w-8 text-[var(--color-muted-foreground)]" />
          <p className="text-xs text-[var(--color-muted-foreground)]">
            No workspace configured. Open Settings to set a workspace directory.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.SETTINGS}>Open Settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              filesOpenInVscode(workspaceDir).catch((err: unknown) =>
                logger.error("open in VS Code failed:", err),
              );
            }}
            title="Open workspace in VS Code"
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <Code2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewFileDialog("file");
              setNewFileName("");
              requestAnimationFrame(() => newFileInputRef.current?.focus());
            }}
            title="New File"
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewFileDialog("folder");
              setNewFileName("");
              requestAnimationFrame(() => newFileInputRef.current?.focus());
            }}
            title="New Folder"
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh"
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Workspace label */}
      <div className="shrink-0 truncate border-b border-[var(--color-border)] px-3 py-1 text-[11px] font-medium text-[var(--color-foreground)]">
        {workspaceDir.split("/").pop() ?? workspaceDir}
      </div>

      {/* Inline new file dialog */}
      {newFileDialog && (
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5 bg-[var(--color-muted)]">
          <input
            ref={newFileInputRef}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleNewFileSubmit();
              if (e.key === "Escape") {
                setNewFileDialog(null);
                setNewFileName("");
              }
            }}
            placeholder={newFileDialog === "folder" ? "folder-name" : "filename.txt"}
            className={cn(
              "flex-1 rounded border border-[var(--color-input)] bg-[var(--color-background)]",
              "px-2 py-0.5 text-[11px] text-[var(--color-foreground)] outline-none",
              "focus:ring-1 focus:ring-[var(--color-ring)]",
            )}
          />
          <button
            type="button"
            onClick={() => {
              setNewFileDialog(null);
              setNewFileName("");
            }}
            className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Hidden toggle row */}
      <div className="shrink-0 flex items-center justify-end border-b border-[var(--color-border)] px-3 py-1">
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          title="Show hidden files (.git, etc.)"
        >
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => {
              setShowHidden(e.target.checked);
              setRefreshKey((k) => k + 1);
            }}
            className="h-3 w-3 rounded border-[var(--color-input)] accent-[var(--color-primary)]"
          />
          <span className="text-[10px] text-[var(--color-muted-foreground)]">Show hidden</span>
        </label>
      </div>

      {/* The tree itself */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FileTree
          key={refreshKey}
          rootPath={workspaceDir}
          selectedPath={selectedPath}
          onFileSelect={(entry) => {
            // Only open files in editor — directories just expand in the tree.
            if (!entry.is_dir) onFileOpen(entry);
          }}
          onRefresh={handleRefresh}
          onDelete={() => setRefreshKey((k) => k + 1)}
          onRename={() => setRefreshKey((k) => k + 1)}
          showHidden={showHidden}
        />
      </div>
    </div>
  );
}

