import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

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

function ContextMenu({
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
  const ref = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Start at the cursor; clamp into the viewport once we can measure the menu.
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  // Re-clamp whenever the requested position changes (new right-click).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    setPos({
      left: Math.max(margin, Math.min(state.x, maxLeft)),
      top: Math.max(margin, Math.min(state.y, maxTop)),
    });
  }, [state.x, state.y]);

  // Dismiss on outside-click, Escape, scroll, and window blur — standard
  // desktop context-menu behaviour.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Capture-phase scroll so nested scroll containers also dismiss the menu.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Move keyboard focus into the menu so arrow/Escape keys work and a
  // subsequent click anywhere else dismisses it.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(state.entry.path);
    } catch {
      // Clipboard API may be unavailable in some contexts — silent fail.
    }
    onClose();
  }

  function handleOpenTerminal() {
    const dirPath = state.entry.is_dir
      ? state.entry.path
      : state.entry.path.substring(0, state.entry.path.lastIndexOf("/"));
    window.dispatchEvent(new CustomEvent("open-terminal-at", { detail: { path: dirPath } }));
    onClose();
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

  const menuItems: {
    label: string;
    onClick: () => void | Promise<void>;
    show: boolean;
    destructive?: boolean;
  }[] = [
    {
      label: "Open Terminal Here",
      onClick: handleOpenTerminal,
      show: true,
    },
    {
      label: "Rename",
      onClick: () => {
        onStartRename?.(state.entry);
        onClose();
      },
      show: !!onStartRename,
    },
    { label: "Copy Path", onClick: handleCopyPath, show: true },
    {
      label: confirmDelete ? `Confirm Delete "${state.entry.name}"?` : "Delete",
      onClick: handleDelete,
      show: !!onDelete,
      destructive: true,
    },
  ];

  const visibleItems = menuItems.filter((item) => item.show);

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={`Actions for ${state.entry.name}`}
      className="fixed z-50 min-w-[160px] rounded-md border border-[var(--color-border)] py-1 shadow-lg outline-none"
      style={{ left: pos.left, top: pos.top, backgroundColor: "var(--color-popover)" }}
    >
      {visibleItems.map((item, i) => (
        <div key={item.label}>
          {item.destructive && i > 0 && (
            <div className="my-1 border-t border-[var(--color-border)]" />
          )}
          <button
            role="menuitem"
            onClick={item.onClick}
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm transition-colors",
              item.destructive
                ? "text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                : "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
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
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={onDelete}
          onStartRename={onRename ? (entry) => setRenamingPath(entry.path) : undefined}
        />
      )}
    </>
  );
}
