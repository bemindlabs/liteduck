import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";

const logger = createLogger("FilesPage");
import {
  ChevronRight,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Settings,
  Code2,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/FileTree";
import { FilePreview } from "@/components/FilePreview";
import {
  type FileEntry,
  filesCreateDir,
  filesGetMetadata,
  filesOpenInVscode,
  filesUnwatch,
  filesWatch,
  filesWriteText,
} from "@/lib/files";
import { listen } from "@tauri-apps/api/event";
import { surfaceFileError } from "@/lib/fileOps";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ── Breadcrumb ────────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  rootPath: string;
  selectedPath: string | null;
}

function Breadcrumb({ rootPath, selectedPath }: BreadcrumbProps) {
  if (!selectedPath) {
    return (
      <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] min-w-0 overflow-hidden">
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{rootPath}</span>
      </div>
    );
  }

  // Build relative path segments.
  const rel = selectedPath.startsWith(rootPath)
    ? selectedPath.slice(rootPath.length).replace(/^\//, "")
    : selectedPath;

  const segments = rel.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] min-w-0 overflow-hidden">
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      <span
        className="shrink-0 truncate max-w-[180px] hover:text-[var(--color-foreground)] cursor-default"
        title={rootPath}
      >
        {rootPath.split("/").pop() ?? rootPath}
      </span>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1 shrink-0 min-w-0">
          <ChevronRight className="h-3 w-3 text-[var(--color-muted-foreground)]" />
          <span
            className={cn(
              "truncate max-w-[160px]",
              i === segments.length - 1 && "text-[var(--color-foreground)] font-medium",
            )}
            title={seg}
          >
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Resizable divider ─────────────────────────────────────────────────────────

interface ResizablePanelProps {
  leftWidth: number;
  onResize: (width: number) => void;
  minLeft?: number;
  maxLeft?: number;
}

function ResizeDivider({
  onResize,
  minLeft = 160,
  maxLeft = 600,
}: Omit<ResizablePanelProps, "leftWidth">) {
  const dragging = useRef(false);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const clamped = Math.max(minLeft, Math.min(maxLeft, ev.clientX));
      onResize(clamped);
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
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] hover:bg-[var(--color-secondary)] transition-colors active:bg-[var(--color-primary)]"
    />
  );
}

// ── FilesPage ─────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const workspaceDir = workspace.trim() !== "" ? workspace.trim() : null;
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [leftWidth, setLeftWidth] = useState(240);
  const [showHidden, setShowHidden] = useState(true);

  // New file / folder state
  const [newFileDialog, setNewFileDialog] = useState<"file" | "folder" | null>(null);
  const [newFileName, setNewFileName] = useState("");
  // Explicit create target from the tree context menu; null falls back to `targetDir`.
  const [createTargetDir, setCreateTargetDir] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Reset selected entry when workspace changes. Synchronising local UI state
  // with an external change (the active workspace) is a valid effect use.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelectedEntry(null);
    setRefreshKey((k) => k + 1);
  }, [workspace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Listen for "Open Terminal Here" from FileTree context menu
  useEffect(() => {
    function handleOpenTerminal(e: Event) {
      const detail = (e as CustomEvent<{ path?: string } | null>).detail;
      const path = detail?.path;
      if (!path) return;
      invoke("terminal_create", {
        cmd: "",
        args: [] as string[],
        cwd: path,
        cols: 120,
        rows: 30,
      })
        .then(() => navigate(ROUTES.TERMINAL))
        .catch((err: unknown) => logger.error("open terminal failed:", err));
    }
    window.addEventListener("open-terminal-at", handleOpenTerminal);
    return () => window.removeEventListener("open-terminal-at", handleOpenTerminal);
  }, [navigate]);

  const handleFileSelect = useCallback(async (entry: FileEntry) => {
    // Re-fetch metadata to ensure freshness before showing preview.
    try {
      const fresh = await filesGetMetadata(entry.path);
      setSelectedEntry(fresh);
    } catch {
      setSelectedEntry(entry);
    }
  }, []);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    setSelectedEntry(null);
  }

  // Live auto-refresh: watch the workspace and bump the in-place refresh signal
  // on filesystem changes (debounced). The tree refreshes without remounting, so
  // expanded folders stay open.
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

  /** The directory to create new items in: selected dir, parent of selected file, or workspace root. */
  const targetDir = useMemo(() => {
    if (!workspaceDir) return null;
    if (!selectedEntry) return workspaceDir;
    if (selectedEntry.is_dir) return selectedEntry.path;
    // Parent of selected file
    const parts = selectedEntry.path.split("/");
    parts.pop();
    return parts.join("/") || workspaceDir;
  }, [workspaceDir, selectedEntry]);

  const startCreate = useCallback((kind: "file" | "folder", dir: string | null) => {
    setCreateTargetDir(dir);
    setNewFileDialog(kind);
    setNewFileName("");
    requestAnimationFrame(() => newFileInputRef.current?.focus());
  }, []);

  const handleNewFileSubmit = useCallback(async () => {
    const dir = createTargetDir ?? targetDir;
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
  }, [createTargetDir, targetDir, newFileName, newFileDialog]);

  const handleDelete = useCallback(
    (deleted: FileEntry) => {
      if (selectedEntry?.path === deleted.path) {
        setSelectedEntry(null);
      }
      setRefreshKey((k) => k + 1);
    },
    [selectedEntry],
  );

  const handleRename = useCallback(
    (oldEntry: FileEntry, _newPath: string) => {
      if (selectedEntry?.path === oldEntry.path) {
        setSelectedEntry(null);
      }
      setRefreshKey((k) => k + 1);
    },
    [selectedEntry],
  );

  // ── No workspace configured ─────────────────────────────────────────────

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <FolderOpen className="mx-auto h-10 w-10 text-[var(--color-muted-foreground)]" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--color-foreground)]">
              No workspace configured
            </h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Set a workspace directory in settings to browse your project files.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={ROUTES.SETTINGS}>
              <Settings className="h-4 w-4" />
              Open Settings
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Top bar: breadcrumb + actions */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Breadcrumb rootPath={workspaceDir} selectedPath={selectedEntry?.path ?? null} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const path = selectedEntry?.path ?? workspaceDir;
            if (path)
              filesOpenInVscode(path).catch((err: unknown) =>
                logger.error("open in VS Code failed:", err),
              );
          }}
          title={
            selectedEntry ? `Open "${selectedEntry.name}" in VS Code` : "Open workspace in VS Code"
          }
          className="h-7 gap-1.5 text-xs shrink-0"
        >
          <Code2 className="h-3.5 w-3.5" />
          VS Code
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startCreate("file", null)}
          title="New File"
          className="h-7 gap-1.5 text-xs shrink-0"
        >
          <FilePlus className="h-3.5 w-3.5" />
          New File
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startCreate("folder", null)}
          title="New Folder"
          className="h-7 gap-1.5 text-xs shrink-0"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Folder
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          title="Refresh"
          className="h-7 w-7 shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* New file/folder inline dialog */}
      {newFileDialog && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 bg-[var(--color-muted)]">
          <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
            {newFileDialog === "folder" ? "New Folder:" : "New File:"}
          </span>
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
            className="flex-1 rounded border border-[var(--color-input)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-foreground)] outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleNewFileSubmit()}
          >
            Create
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setNewFileDialog(null);
              setNewFileName("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: file tree */}
        <div
          className="flex flex-col overflow-hidden border-r border-[var(--color-border)]"
          style={{ width: leftWidth, minWidth: leftWidth, maxWidth: leftWidth }}
        >
          <div className="shrink-0 flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
            <span className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wide">
              Explorer
            </span>
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
              <span className="text-[10px] text-[var(--color-muted-foreground)]">Hidden</span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree
              key={workspaceDir}
              rootPath={workspaceDir}
              selectedPath={selectedEntry?.path ?? null}
              onFileSelect={handleFileSelect}
              onRefresh={handleRefresh}
              onDelete={handleDelete}
              onRename={handleRename}
              onCreate={(dir, kind) => startCreate(kind, dir)}
              onChanged={() => setRefreshKey((k) => k + 1)}
              showHidden={showHidden}
              refreshSignal={refreshKey}
            />
          </div>
        </div>

        {/* Resize handle */}
        <ResizeDivider onResize={setLeftWidth} minLeft={160} maxLeft={600} />

        {/* Right: file preview */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <FilePreview entry={selectedEntry} docsMode={false} />
        </div>
      </div>
    </div>
  );
}
