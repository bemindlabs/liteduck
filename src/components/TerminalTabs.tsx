import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { X } from "lucide-react";
import type { TerminalTab } from "@/hooks/useTerminal";
import { cn } from "@/lib/utils";
import { TerminalPane } from "./terminal/TerminalPane";

// ── TabLabel (inline rename) ──────────────────────────────────────────────────

interface TabLabelProps {
  tab: Pick<TerminalTab, "id" | "label">;
  onRename?: (id: string, newName: string) => void;
}

function TabLabel({ tab, onRename }: TabLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      if (!onRename) return;
      e.stopPropagation();
      setDraft(tab.label);
      setEditing(true);
    },
    [onRename, tab.label],
  );

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.label) {
      onRename?.(tab.id, trimmed);
    }
    setEditing(false);
  }, [draft, tab.id, tab.label, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commit();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [commit],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-24 min-w-0 rounded bg-[var(--color-background)] px-1 text-xs font-medium text-[var(--color-foreground)] outline-none ring-1 ring-[var(--color-accent)]"
        aria-label="Rename tab"
      />
    );
  }

  return (
    <span
      className="truncate"
      onDoubleClick={onRename ? startEdit : undefined}
      title={onRename ? "Double-click to rename" : undefined}
    >
      {tab.label}
    </span>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab?: (id: string, newName: string) => void;
  actions?: React.ReactNode;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  actions,
}: TabBarProps) {
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-1.5"
      style={{ scrollbarWidth: "none" }}
      role="tablist"
      aria-label="Terminal tabs"
    >
      {/* Local (PTY) tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          tabIndex={tab.id === activeTabId ? 0 : -1}
          onClick={() => onSelectTab(tab.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelectTab(tab.id);
          }}
          className={cn(
            "group flex h-6 max-w-[160px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors",
            tab.id === activeTabId
              ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
              tab.running ? "bg-success" : "bg-[var(--color-muted)]",
            )}
            aria-hidden
          />

          <TabLabel tab={tab} onRename={onRenameTab} />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className={cn(
              "ml-0.5 shrink-0 rounded p-0.5 transition-all",
              "opacity-0 group-hover:opacity-100",
              "hover:text-[var(--color-destructive)]",
            )}
            aria-label={`Close ${tab.label}`}
            title="Close tab"
            tabIndex={-1}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {actions && <div className="ml-auto flex shrink-0 items-center pl-1">{actions}</div>}
    </div>
  );
}

// ── TerminalPanes ─────────────────────────────────────────────────────────────

interface TerminalPanesProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onInput: (tabId: string, data: string) => void;
  onResize: (tabId: string, cols: number, rows: number) => void;
  onRegisterXterm: (tabId: string, xterm: XTerm) => void;
  onUnregisterXterm: (tabId: string) => void;
  /** Bumped when the split layout changes, triggering an xterm re-fit. */
  layoutSignal?: number;
}

export function TerminalPanes({
  tabs,
  activeTabId,
  onInput,
  onResize,
  onRegisterXterm,
  onUnregisterXterm,
  layoutSignal,
}: TerminalPanesProps) {
  return (
    <div
      className="relative flex-1 overflow-hidden"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {/* Local PTY panes */}
      {tabs.map((tab) => (
        <TerminalPane
          key={tab.id}
          tabId={tab.id}
          visible={tab.id === activeTabId}
          layoutSignal={layoutSignal}
          onInput={(data) => onInput(tab.id, data)}
          onResize={(cols, rows) => onResize(tab.id, cols, rows)}
          onRegister={(xterm) => onRegisterXterm(tab.id, xterm)}
          onUnregister={() => onUnregisterXterm(tab.id)}
        />
      ))}
    </div>
  );
}

// ── TerminalTabs (convenience composite) ─────────────────────────────────────

interface TerminalTabsProps extends TerminalPanesProps {
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab?: (id: string, newName: string) => void;
  actions?: React.ReactNode;
}

export default function TerminalTabs({
  tabs,
  activeTabId: activeTabIdProp,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onInput,
  onResize,
  onRegisterXterm,
  onUnregisterXterm,
  actions,
  layoutSignal,
}: TerminalTabsProps) {
  const [activeTabId, setActiveTabId] = useState(activeTabIdProp);

  useEffect(() => {
    setActiveTabId(activeTabIdProp);
  }, [activeTabIdProp]);

  function handleSelectTab(id: string) {
    setActiveTabId(id);
    onSelectTab(id);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={onCloseTab}
        onRenameTab={onRenameTab}
        actions={actions}
      />
      <TerminalPanes
        tabs={tabs}
        activeTabId={activeTabId}
        onInput={onInput}
        onResize={onResize}
        onRegisterXterm={onRegisterXterm}
        onUnregisterXterm={onUnregisterXterm}
        layoutSignal={layoutSignal}
      />
    </div>
  );
}
