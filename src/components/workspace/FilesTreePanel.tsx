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
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import {
  type FileEntry,
  filesCreateDir,
  filesOpenInVscode,
  filesUnwatch,
  filesWatch,
  filesWriteText,
} from "@/lib/files";
import { listen } from "@tauri-apps/api/event";
import { fileClipboardStore, useFileClipboard } from "@/lib/fileClipboard";
import { pasteInto, surfaceFileError } from "@/lib/fileOps";
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
  // Directory a New File/Folder lands in — set by the toolbar (workspace root) or
  // by the tree context menu (the right-clicked folder).
  const [createTargetDir, setCreateTargetDir] = useState<string | null>(null);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const clipboard = useFileClipboard();

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

  // Live auto-refresh: watch the workspace tree and bump the refresh signal on
  // any filesystem change. The signal drives an *in-place* tree refresh (not a
  // remount), so expanded folders stay open. Events are debounced because a
  // single save/move can emit a burst.
  useEffect(() => {
    if (!workspaceDir) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlistenP = listen("files://changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) setRefreshKey((k) => k + 1);
      }, 250);
    });
    void filesWatch(workspaceDir).catch((err: unknown) => logger.error("watch failed:", err));
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void unlistenP.then((un) => un());
      void filesUnwatch(workspaceDir).catch((err: unknown) => logger.error("unwatch failed:", err));
    };
  }, [workspaceDir]);

  // Begin a New File/Folder flow targeted at `dir` (defaults to workspace root).
  const startCreate = useCallback(
    (kind: "file" | "folder", dir: string | null) => {
      setCreateTargetDir(dir ?? workspaceDir);
      setNewFileDialog(kind);
      setNewFileName("");
      requestAnimationFrame(() => newFileInputRef.current?.focus());
    },
    [workspaceDir],
  );

  const handleNewFileSubmit = useCallback(async () => {
    const dir = createTargetDir ?? workspaceDir;
    if (!dir || !newFileName.trim()) return;
    const fullPath = `${dir.replace(/\/+$/, "")}/${newFileName.trim()}`;
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
      surfaceFileError("Create", err);
    }
  }, [createTargetDir, workspaceDir, newFileName, newFileDialog]);

  // Background (empty-space) context menu — create at root / paste / refresh.
  async function handleBgPaste() {
    if (!clipboard || !workspaceDir) return;
    const op = clipboard.op;
    const n = await pasteInto(workspaceDir, clipboard);
    if (op === "cut" && n > 0) fileClipboardStore.clear();
    setRefreshKey((k) => k + 1);
  }

  const bgMenuItems: ContextMenuItem[] = [
    { label: "New File", onSelect: () => startCreate("file", workspaceDir) },
    { label: "New Folder", onSelect: () => startCreate("folder", workspaceDir) },
    {
      label: "Paste",
      onSelect: handleBgPaste,
      show: !!clipboard,
      separatorBefore: true,
    },
    { label: "Refresh", onSelect: handleRefresh, separatorBefore: true },
  ];

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
            onClick={() => startCreate("file", workspaceDir)}
            title="New File"
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => startCreate("folder", workspaceDir)}
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

      {/* The tree itself — the empty area also takes a context menu (create/paste). */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        onContextMenu={(e) => {
          // Only when the click lands on the background, not on a tree row
          // (rows stop propagation by opening their own menu via preventDefault).
          if (e.defaultPrevented) return;
          e.preventDefault();
          setBgMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <FileTree
          key={workspaceDir}
          rootPath={workspaceDir}
          selectedPath={selectedPath}
          onFileSelect={(entry) => {
            // Only open files in editor — directories just expand in the tree.
            if (!entry.is_dir) onFileOpen(entry);
          }}
          onRefresh={handleRefresh}
          onDelete={() => setRefreshKey((k) => k + 1)}
          onRename={() => setRefreshKey((k) => k + 1)}
          onCreate={(dir, kind) => startCreate(kind, dir)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          showHidden={showHidden}
          refreshSignal={refreshKey}
        />
      </div>

      {bgMenu && (
        <ContextMenu
          x={bgMenu.x}
          y={bgMenu.y}
          items={bgMenuItems}
          onClose={() => setBgMenu(null)}
          ariaLabel="Explorer actions"
        />
      )}
    </div>
  );
}
