import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { LITEDUCK_PATH_MIME } from "@/utils/shellQuote";
import {
  type FileEntry,
  filesDelete,
  filesListDir,
  filesOpenInVscode,
  filesRename,
  filesRevealInOs,
  formatBytes,
  getFileIcon,
} from "@/lib/files";
import { fileClipboardStore, useFileClipboard, type FileClipboard } from "@/lib/fileClipboard";
import { dirname, duplicateEntry, moveInto, pasteInto, surfaceFileError } from "@/lib/fileOps";

// Optional override type — when provided, replaces the default local command.
export type ListDirFn = (path: string, showHidden?: boolean) => Promise<FileEntry[]>;

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

/**
 * File-tree context menu — the full right-click action surface: create, the
 * clipboard trio (cut / copy / paste) + duplicate, rename / delete, and the
 * "copy path / reveal / open" group. Renders via the shared ContextMenu
 * primitive; Delete keeps its two-step in-menu confirmation (`keepOpen`).
 */
function FileTreeContextMenu({
  state,
  rootPath,
  clipboard,
  onClose,
  onDelete,
  onStartRename,
  onCreate,
  onChanged,
}: {
  state: ContextMenuState;
  rootPath: string;
  clipboard: FileClipboard | null;
  onClose: () => void;
  onDelete?: (entry: FileEntry) => void;
  onStartRename?: (entry: FileEntry) => void;
  onCreate?: (parentDir: string, kind: "file" | "folder") => void;
  onChanged?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { entry } = state;
  // Where a paste / create lands: into the entry if it's a folder, else its parent.
  const targetDir = entry.is_dir ? entry.path : dirname(entry.path);

  async function copyToOsClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API may be unavailable in some contexts — silent fail.
    }
  }

  function relativePath(): string {
    if (entry.path === rootPath) return entry.name;
    const prefix = rootPath.replace(/\/+$/, "") + "/";
    return entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
  }

  function handleOpenTerminal() {
    const dirPath = entry.is_dir ? entry.path : dirname(entry.path);
    window.dispatchEvent(new CustomEvent("open-terminal-at", { detail: { path: dirPath } }));
  }

  async function handlePaste() {
    if (!clipboard) return;
    const op = clipboard.op;
    const n = await pasteInto(targetDir, clipboard);
    if (op === "cut" && n > 0) fileClipboardStore.clear();
    onChanged?.();
  }

  async function handleDuplicate() {
    await duplicateEntry(entry.path);
    onChanged?.();
  }

  async function handleReveal() {
    try {
      await filesRevealInOs(entry.path);
    } catch (err) {
      surfaceFileError("Reveal", err);
    }
  }

  async function handleOpenVscode() {
    try {
      await filesOpenInVscode(entry.path);
    } catch (err) {
      surfaceFileError("Open in VS Code", err);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await filesDelete(entry.path);
      onDelete?.(entry);
    } catch (err) {
      surfaceFileError("Delete", err);
    }
    onClose();
  }

  const items: ContextMenuItem[] = [
    {
      label: "New File",
      onSelect: () => onCreate?.(targetDir, "file"),
      show: !!onCreate && entry.is_dir,
    },
    {
      label: "New Folder",
      onSelect: () => onCreate?.(targetDir, "folder"),
      show: !!onCreate && entry.is_dir,
    },
    {
      label: "Cut",
      onSelect: () => fileClipboardStore.set("cut", [entry.path]),
      separatorBefore: true,
    },
    { label: "Copy", onSelect: () => fileClipboardStore.set("copy", [entry.path]) },
    {
      label: "Paste",
      onSelect: handlePaste,
      show: !!clipboard && entry.is_dir,
      disabled: !clipboard,
    },
    { label: "Duplicate", onSelect: handleDuplicate },
    {
      label: "Rename",
      onSelect: () => onStartRename?.(entry),
      show: !!onStartRename,
      separatorBefore: true,
    },
    {
      label: confirmDelete ? `Confirm Delete "${entry.name}"?` : "Delete",
      onSelect: handleDelete,
      show: !!onDelete,
      destructive: true,
      keepOpen: !confirmDelete,
    },
    {
      label: "Copy Path",
      onSelect: () => copyToOsClipboard(entry.path),
      separatorBefore: true,
    },
    { label: "Copy Relative Path", onSelect: () => copyToOsClipboard(relativePath()) },
    { label: "Reveal in Finder", onSelect: handleReveal },
    { label: "Open in VS Code", onSelect: handleOpenVscode },
    { label: "Open Terminal Here", onSelect: handleOpenTerminal, separatorBefore: true },
  ];

  return (
    <ContextMenu
      x={state.x}
      y={state.y}
      items={items}
      onClose={onClose}
      ariaLabel={`Actions for ${entry.name}`}
    />
  );
}

// ── Inline rename input ──────────────────────────────────────────────────────

function RenameInput({
  defaultName,
  onSubmit,
  onCancel,
}: {
  defaultName: string;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Select the name without the extension for files.
    const dotIdx = defaultName.lastIndexOf(".");
    el.setSelectionRange(0, dotIdx > 0 ? dotIdx : defaultName.length);
  }, [defaultName]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = inputRef.current?.value.trim();
      if (val && val !== defaultName) {
        onSubmit(val);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  function handleBlur() {
    const val = inputRef.current?.value.trim();
    if (val && val !== defaultName) {
      onSubmit(val);
    } else {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      defaultValue={defaultName}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 min-w-0 bg-[var(--color-background)] text-[var(--color-foreground)] text-sm border border-[var(--color-primary)] rounded px-1 py-0 outline-none"
    />
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  contextPath: string | null;
  renamingPath: string | null;
  onFileSelect: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  onRenameSubmit: (entry: FileEntry, newName: string) => void;
  onRenameCancel: () => void;
  onMove: (srcPath: string, targetDir: string) => void;
  showHidden?: boolean;
  listDir?: ListDirFn;
  /** Bumped to trigger an in-place refresh of loaded subtrees (preserves expansion). */
  refreshSignal: number;
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  contextPath,
  renamingPath,
  onFileSelect,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
  onMove,
  showHidden = false,
  listDir,
  refreshSignal,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const loadedRef = useRef(false);

  const loadChildren = useCallback(
    async (force = false) => {
      if (loadedRef.current && !force) return;
      loadedRef.current = true;
      setLoading(true);
      setLoadError(null);
      const doList = listDir ?? filesListDir;
      try {
        const items = await doList(entry.path, showHidden);
        setChildren(items);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [entry.path, showHidden, listDir],
  );

  // In-place refresh: when the tree signals a change, re-fetch this node's
  // children if it's currently showing them (preserving its expanded state),
  // otherwise just drop the cache so the next expand fetches fresh. This avoids
  // the collapse-everything churn of remounting the whole tree.
  const seenSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === seenSignal.current) return;
    seenSignal.current = refreshSignal;
    if (expanded && loadedRef.current) {
      void loadChildren(true);
    } else {
      loadedRef.current = false;
    }
  }, [refreshSignal, expanded, loadChildren]);

  function handleClick() {
    if (entry.is_dir) {
      if (!expanded) void loadChildren();
      setExpanded((v) => !v);
    } else {
      onFileSelect(entry);
    }
  }

  // Drag-to-move: a folder accepts a dropped tree entry and moves it inside.
  // We reject dropping a folder onto itself or one of its own descendants.
  function canAcceptDrop(srcPath: string): boolean {
    if (!entry.is_dir) return false;
    if (srcPath === entry.path) return false;
    if (entry.path === srcPath || entry.path.startsWith(srcPath.replace(/\/+$/, "") + "/")) {
      return false;
    }
    return true;
  }

  const isSelected = selectedPath === entry.path;
  // The row a context menu currently targets — highlighted like a selection so
  // it's clear which item the actions apply to, without opening the file.
  const isContextTarget = contextPath === entry.path;
  const icon = getFileIcon(entry);
  const indentPx = depth * 16;

  return (
    <div>
      {/* Row */}
      <button
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entry)}
        draggable
        onDragStart={(e) => {
          // Internal drag payload: drop onto the terminal inserts the path; drop
          // onto a folder moves the entry. effectAllowed allows both.
          e.dataTransfer.setData(LITEDUCK_PATH_MIME, entry.path);
          e.dataTransfer.setData("text/plain", entry.path);
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        onDragOver={
          entry.is_dir
            ? (e) => {
                if (e.dataTransfer.types.includes(LITEDUCK_PATH_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (!dropTarget) setDropTarget(true);
                }
              }
            : undefined
        }
        onDragLeave={entry.is_dir ? () => setDropTarget(false) : undefined}
        onDrop={
          entry.is_dir
            ? (e) => {
                setDropTarget(false);
                const src = e.dataTransfer.getData(LITEDUCK_PATH_MIME);
                if (src && canAcceptDrop(src)) {
                  e.preventDefault();
                  onMove(src, entry.path);
                }
              }
            : undefined
        }
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-sm px-2 py-0.5 text-left text-sm transition-colors",
          "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
          isSelected &&
            "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-medium",
          isContextTarget &&
            "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] ring-1 ring-inset ring-[var(--color-border)]",
          dropTarget && "ring-1 ring-inset ring-[var(--color-primary)] bg-[var(--color-accent)]",
        )}
        style={{ paddingLeft: `${indentPx + 8}px` }}
        title={entry.path}
      >
        {/* Expand chevron (directories only) */}
        <span className="shrink-0 text-[var(--color-muted-foreground)] w-3 h-3 flex items-center justify-center">
          {entry.is_dir ? (
            loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : null}
        </span>

        {/* Icon */}
        <span className="shrink-0 leading-none">{icon}</span>

        {/* Name */}
        {renamingPath === entry.path ? (
          <RenameInput
            defaultName={entry.name}
            onSubmit={(newName) => onRenameSubmit(entry, newName)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="flex-1 truncate">{entry.name}</span>
        )}

        {/* File size */}
        {entry.is_file && entry.size > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)] group-hover:text-[var(--color-accent-foreground)]">
            {formatBytes(entry.size)}
          </span>
        )}
      </button>

      {/* Error */}
      {loadError && expanded && (
        <p
          className="px-2 py-0.5 text-xs text-[var(--color-destructive)]"
          style={{ paddingLeft: `${indentPx + 24}px` }}
        >
          {loadError}
        </p>
      )}

      {/* Children */}
      {entry.is_dir && expanded && !loading && children.length === 0 && !loadError && (
        <p
          className="py-0.5 text-xs text-[var(--color-muted-foreground)] italic"
          style={{ paddingLeft: `${indentPx + 24}px` }}
        >
          Empty
        </p>
      )}

      {entry.is_dir && expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              contextPath={contextPath}
              renamingPath={renamingPath}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onMove={onMove}
              showHidden={showHidden}
              listDir={listDir}
              refreshSignal={refreshSignal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── FileTree ──────────────────────────────────────────────────────────────────

interface FileTreeProps {
  rootPath: string;
  selectedPath: string | null;
  onFileSelect: (entry: FileEntry) => void;
  onRefresh?: () => void;
  onDelete?: (entry: FileEntry) => void;
  onRename?: (oldEntry: FileEntry, newPath: string) => void;
  /** Open the host's create flow targeted at `parentDir`. Enables New File/Folder. */
  onCreate?: (parentDir: string, kind: "file" | "folder") => void;
  /** Called after a mutation (paste / duplicate / move) so the host can refresh. */
  onChanged?: () => void;
  showHidden?: boolean;
  /** When provided, replaces the default local `filesListDir` call. */
  listDir?: ListDirFn;
  /** Bumped by the host (external watcher or mutation) to refresh in place. */
  refreshSignal?: number;
}

export function FileTree({
  rootPath,
  selectedPath,
  onFileSelect,
  onRefresh,
  onDelete,
  onRename,
  onCreate,
  onChanged,
  showHidden = false,
  listDir,
  refreshSignal = 0,
}: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const clipboard = useFileClipboard();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const doList = listDir ?? filesListDir;
    try {
      const items = await doList(rootPath, showHidden);
      setEntries(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath, listDir, showHidden]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // A mutation happened — prefer the host's refresh (which usually remounts the
  // whole tree so expanded subdirectories also reflect the change), else reload.
  const handleChanged = useCallback(() => {
    if (onChanged) onChanged();
    else void load();
  }, [onChanged, load]);

  const handleMove = useCallback(
    (srcPath: string, targetDir: string) => {
      void moveInto(srcPath, targetDir).then(handleChanged);
    },
    [handleChanged],
  );

  function handleContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }

  function handleRefresh() {
    void load();
    onRefresh?.();
  }

  async function handleRenameSubmit(entry: FileEntry, newName: string) {
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    try {
      await filesRename(entry.path, newPath);
      onRename?.(entry, newPath);
      void load();
    } catch (err) {
      surfaceFileError("Rename", err);
    }
    setRenamingPath(null);
  }

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-sm text-[var(--color-destructive)]">
        <p className="font-medium">Failed to load directory</p>
        <p className="mt-1 text-xs opacity-80">{error}</p>
        <button onClick={handleRefresh} className="mt-2 text-xs underline hover:no-underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="select-none overflow-y-auto py-1">
        {entries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            selectedPath={selectedPath}
            contextPath={contextMenu?.entry.path ?? null}
            renamingPath={renamingPath}
            onFileSelect={onFileSelect}
            onContextMenu={handleContextMenu}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            onMove={handleMove}
            showHidden={showHidden}
            listDir={listDir}
            refreshSignal={refreshSignal}
          />
        ))}
        {entries.length === 0 && (
          <p className="px-3 py-2 text-xs text-[var(--color-muted-foreground)] italic">
            Directory is empty
          </p>
        )}
      </div>

      {contextMenu && (
        <FileTreeContextMenu
          state={contextMenu}
          rootPath={rootPath}
          clipboard={clipboard}
          onClose={() => setContextMenu(null)}
          onDelete={onDelete}
          onStartRename={onRename ? (entry) => setRenamingPath(entry.path) : undefined}
          onCreate={onCreate}
          onChanged={handleChanged}
        />
      )}
    </>
  );
}
