import { useEffect, useMemo, useRef, useState, useCallback, KeyboardEvent } from "react";
import {
  Terminal,
  KanbanSquare,
  Settings,
  Plus,
  X,
  Columns2,
  Rows2,
  Sun,
  Search,
  PanelLeft,
  GitBranch,
  FolderTree,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMMANDS,
  PAGE_ROUTES,
  filterCommands,
  loadRecentIds,
  saveRecentId,
  type Command,
  type CommandCategory,
} from "@/lib/commands";

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  Terminal: <Terminal className="h-4 w-4" />,
  KanbanSquare: <KanbanSquare className="h-4 w-4" />,
  Settings: <Settings className="h-4 w-4" />,
  Plus: <Plus className="h-4 w-4" />,
  X: <X className="h-4 w-4" />,
  Columns2: <Columns2 className="h-4 w-4" />,
  Rows2: <Rows2 className="h-4 w-4" />,
  Sun: <Sun className="h-4 w-4" />,
  PanelLeft: <PanelLeft className="h-4 w-4" />,
  GitBranch: <GitBranch className="h-4 w-4" />,
  FolderTree: <FolderTree className="h-4 w-4" />,
  Bell: <Bell className="h-4 w-4" />,
};

function resolveIcon(iconName: string): React.ReactNode {
  return ICON_MAP[iconName] ?? <Terminal className="h-4 w-4" />;
}

// ── Category badge colors ─────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<CommandCategory, { className: string }> = {
  Pages: { className: "text-info bg-info-subtle" },
  Actions: { className: "text-success bg-success-subtle" },
  Recent: { className: "text-[var(--color-info)] bg-info-subtle" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onToggleDark: () => void;
  onToggleSidebar?: () => void;
  onToggleFocusMode?: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ResultItemProps {
  command: Command;
  active: boolean;
  itemId: string;
  onSelect: () => void;
  onHover: () => void;
}

function ResultItem({ command, active, itemId, onSelect, onHover }: ResultItemProps) {
  return (
    <li
      id={itemId}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
          : "text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
      )}
    >
      <span className="shrink-0 text-[var(--color-muted-foreground)]">
        {resolveIcon(command.icon)}
      </span>

      <span className="flex-1 truncate font-medium">{command.title}</span>

      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          CATEGORY_STYLES[command.category].className,
        )}
      >
        {command.category}
      </span>

      {command.shortcut && (
        <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-muted-foreground)]">
          {command.shortcut}
        </kbd>
      )}
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onToggleDark,
  onToggleSidebar,
  onToggleFocusMode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // Track the element that had focus before the palette opened so we can
  // restore focus on close.
  const prevFocusRef = useRef<Element | null>(null);

  // Refresh recent list and reset state whenever palette opens.
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActiveIndex(0);
      setRecentIds(loadRecentIds());
      // Focus the input on next tick so the animation has begun.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // Restore focus to the previously focused element when the palette closes.
      if (prevFocusRef.current instanceof HTMLElement) {
        prevFocusRef.current.focus();
      }
      prevFocusRef.current = null;
    }
  }, [open]);

  // Build the filtered + sorted list.
  const items = useMemo(() => filterCommands(COMMANDS, query, recentIds), [query, recentIds]);

  // Keep activeIndex in bounds when results change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex((prev) => Math.min(prev, Math.max(items.length - 1, 0)));
  }, [items.length]);

  // Scroll the active item into view.
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      saveRecentId(cmd.id);
      onClose();

      if (cmd.id.startsWith("page-")) {
        const route = PAGE_ROUTES[cmd.id];
        if (route) onNavigate(route);
        return;
      }

      if (cmd.id === "action-toggle-dark") {
        onToggleDark();
        return;
      }

      if (cmd.id === "action-toggle-sidebar") {
        onToggleSidebar?.();
        return;
      }

      if (cmd.id === "action-toggle-focus") {
        onToggleFocusMode?.();
        return;
      }

      // Agent launches and remaining actions delegate to the injected action
      // callback if one was bound, otherwise they are silent no-ops until wired.
      cmd.action?.();
    },
    [onClose, onNavigate, onToggleDark, onToggleSidebar, onToggleFocusMode],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % Math.max(items.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
          break;
        case "Enter":
          e.preventDefault();
          if (items[activeIndex]) executeCommand(items[activeIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [items, activeIndex, executeCommand, onClose],
  );

  if (!open) return null;

  return (
    // Backdrop
    <div
      role="presentation"
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(e) => {
        // Close when clicking the backdrop (not the panel itself).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          "flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)]",
          "shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-150",
        )}
        style={{ backgroundColor: "var(--color-popover)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-palette-results"
            aria-autocomplete="list"
            aria-activedescendant={
              items.length > 0 ? `cmd-item-${items[activeIndex]?.id}` : undefined
            }
            placeholder="Search commands, pages, agents..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-[var(--color-background)] text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-muted-foreground)]">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <ul
          id="cmd-palette-results"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto p-2"
        >
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              No results for &quot;{query}&quot;
            </li>
          ) : (
            items.map((cmd, idx) => (
              <ResultItem
                key={cmd.id}
                command={cmd}
                active={idx === activeIndex}
                itemId={`cmd-item-${cmd.id}`}
                onSelect={() => executeCommand(cmd)}
                onHover={() => setActiveIndex(idx)}
              />
            ))
          )}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-4 py-2">
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            <kbd className="font-mono">↵</kbd> select
          </span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            <kbd className="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
