import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { LITEDUCK_PATH_MIME } from "@/utils/shellQuote";

const logger = createLogger("FileTree");
import {
  type FileEntry,
  filesDelete,
  filesListDir,
  filesRename,
  formatBytes,
  getFileIcon,
} from "@/lib/files";

// Optional override type — when provided, replaces the default local command.
export type ListDirFn = (path: string, showHidden?: boolean) => Promise<FileEntry[]>;

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

/**
 * File-tree context menu — keeps the original actions (Open Terminal Here /
 * Rename / Copy Path / Delete) but now renders via the shared ContextMenu
 * primitive. Delete still uses a two-step in-menu confirmation, which the
 * primitive supports through `keepOpen`.
 */
function FileTreeContextMenu({
  state,
  onClose,
  onDelete,
  onStartRename,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onDelete?: (entry: FileEntry) => void;
  onStartRename?: (entry: FileEntry) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(state.entry.path);
    } catch {
      // Clipboard API may be unavailable in some contexts — silent fail.
    }
  }

  function handleOpenTerminal() {
    const dirPath = state.entry.is_dir
      ? state.entry.path
      : state.entry.path.substring(0, state.entry.path.lastIndexOf("/"));
    window.dispatchEvent(new CustomEvent("open-terminal-at", { detail: { path: dirPath } }));
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await filesDelete(state.entry.path);
      onDelete?.(state.entry);
    } catch (err) {
      logger.error("Delete failed:", err);
    }
    onClose();
  }

  const items: ContextMenuItem[] = [
    { label: "Open Terminal Here", onSelect: handleOpenTerminal },
    {
      label: "Rename",
      onSelect: () => onStartRename?.(state.entry),
      show: !!onStartRename,
    },
    { label: "Copy Path", onSelect: handleCopyPath },
    {
      label: confirmDelete ? `Confirm Delete "${state.entry.name}"?` : "Delete",
      onSelect: handleDelete,
      show: !!onDelete,
      destructive: true,
      separatorBefore: true,
      // First click arms the confirmation; only the second click closes.
      keepOpen: !confirmDelete,
    },
  ];

  return (
    <ContextMenu
      x={state.x}
      y={state.y}
      items={items}
      onClose={onClose}
      ariaLabel={`Actions for ${state.entry.name}`}
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
  showHidden?: boolean;
  listDir?: ListDirFn;
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
  showHidden = false,
  listDir,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  async function loadChildren() {
    if (loadedRef.current) return;
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
  }

  function handleClick() {
    if (entry.is_dir) {
      if (!expanded) void loadChildren();
      setExpanded((v) => !v);
    } else {
      onFileSelect(entry);
    }
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
          // Internal drag payload for "drop onto terminal → insert path".
          // Set a custom mime plus a text/plain fallback. Use "copy" so the
          // path is conceptually copied, not moved.
          e.dataTransfer.setData(LITEDUCK_PATH_MIME, entry.path);
          e.dataTransfer.setData("text/plain", entry.path);
          e.dataTransfer.effectAllowed = "copy";
        }}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-sm px-2 py-0.5 text-left text-sm transition-colors",
          "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
          isSelected &&
            "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-medium",
          isContextTarget &&
            "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] ring-1 ring-inset ring-[var(--color-border)]",
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
              showHidden={showHidden}
              listDir={listDir}
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
  showHidden?: boolean;
  /** When provided, replaces the default local `filesListDir` call. */
  listDir?: ListDirFn;
}

export function FileTree({
  rootPath,
  selectedPath,
  onFileSelect,
  onRefresh,
  onDelete,
  onRename,
  showHidden = false,
  listDir,
}: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

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
  }, [load]);

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
      logger.error("Rename failed:", err);
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
            showHidden={showHidden}
            listDir={listDir}
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
          onClose={() => setContextMenu(null)}
          onDelete={onDelete}
          onStartRename={onRename ? (entry) => setRenamingPath(entry.path) : undefined}
        />
      )}
    </>
  );
}
