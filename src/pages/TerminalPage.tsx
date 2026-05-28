import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, TerminalSquare } from "lucide-react";
import { useTerminal } from "@/hooks/useTerminal";
import type { UseTerminalReturn } from "@/hooks/useTerminal";
import SplitTerminal, {
  type LeafPane,
  type PaneNode,
  type SplitCallbacks,
  type SplitDirection,
} from "@/components/SplitTerminal";
import { countLeaves, splitLeaf, unsplitLeaf, collectLeafIds } from "@/utils/splitTerminalUtils";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLeafId() {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Shared toolbar button classes. */
const toolbarBtnCls = cn(
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
  "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
);

// ── NewTerminalButton ─────────────────────────────────────────────────────────

interface NewTerminalButtonProps {
  onNewTerminal: () => void;
}

function NewTerminalButton({ onNewTerminal }: NewTerminalButtonProps) {
  return (
    <button
      onClick={onNewTerminal}
      className={cn(toolbarBtnCls, "gap-1 px-2")}
      aria-label="New terminal"
      title="New terminal"
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">New</span>
    </button>
  );
}

// ── SplitToolbar ──────────────────────────────────────────────────────────────

interface SplitToolbarProps {
  /** New-terminal button for the primary pane */
  newTerminalButton: React.ReactNode;
}

function SplitToolbar({ newTerminalButton }: SplitToolbarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-2">
      <span className="mr-auto text-xs font-medium text-[var(--color-muted-foreground)]">
        Terminal
      </span>

      {newTerminalButton}
    </div>
  );
}

// ── TerminalPage ──────────────────────────────────────────────────────────────

/**
 * Maintains a Map of pane ID → useTerminal() return value. Because hooks
 * cannot be called conditionally, we pre-create a fixed pool of 4 hook
 * instances and assign them to panes as needed.
 *
 * Pane lifecycle:
 *  - slot 0 is always active (primary pane)
 *  - slots 1-3 are activated when splits occur
 */
function usePanePool(): [
  UseTerminalReturn,
  UseTerminalReturn,
  UseTerminalReturn,
  UseTerminalReturn,
] {
  // We must call hooks unconditionally at the top level — so we always call
  // all four, even if only one is visible. React rules require this.
  const t0 = useTerminal();
  const t1 = useTerminal();
  const t2 = useTerminal();
  const t3 = useTerminal();
  return [t0, t1, t2, t3];
}

export default function TerminalPage() {
  const pool = usePanePool();
  const { workspace } = useWorkspace();

  // workspaceRef is shared across all pane instances.
  const workspaceRef = useRef<string | null>(null);

  // Keep workspaceRef in sync with context
  useEffect(() => {
    workspaceRef.current = workspace || null;
  }, [workspace]);

  // ── Pane tree state ────────────────────────────────────────────────────────

  // Each entry maps a pane ID → pool slot index (0-3).
  const [paneSlotMap, setPaneSlotMap] = useState<Map<string, number>>(() => new Map());

  // The root of the split tree. Starts as null (no terminals yet).
  const [root, setRoot] = useState<PaneNode | null>(null);

  // Track which pool slots are free.
  const [freeSlots, setFreeSlots] = useState([1, 2, 3]);

  // ── Initialise primary pane ────────────────────────────────────────────────

  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const primaryId = makeLeafId();
    setPaneSlotMap(new Map([[primaryId, 0]]));
    setRoot({
      kind: "leaf",
      id: primaryId,
      terminal: pool[0],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Terminal lookup helpers ─────────────────────────────────────────────────

  const getTerminalForPane = useCallback(
    (paneId: string): UseTerminalReturn | null => {
      const slot = paneSlotMap.get(paneId);
      if (slot === undefined) return null;
      return pool[slot];
    },
    [paneSlotMap, pool],
  );

  /** Resolve the terminal hook for the primary (first) pane leaf. */
  const getPrimaryTerminal = useCallback((): UseTerminalReturn | null => {
    if (!root) return null;
    const firstLeafId = collectLeafIds(root)[0];
    return firstLeafId ? getTerminalForPane(firstLeafId) : null;
  }, [root, getTerminalForPane]);

  // ── Global keyboard shortcut event listeners ───────────────────────────────

  useEffect(() => {
    function handleNewTab() {
      const terminal = getPrimaryTerminal();
      if (!terminal) return;

      void terminal.createTab(
        `Terminal ${terminal.tabs.length + 1}`,
        "",
        [],
        workspaceRef.current ?? undefined,
      );
    }

    function handleCloseTab() {
      const terminal = getPrimaryTerminal();
      if (!terminal) return;
      const activeId = terminal.activeTabId;
      if (activeId) terminal.closeTab(activeId);
    }

    function handleOpenAt(e: Event) {
      const { cwd, label } = (e as CustomEvent<{ cwd: string; label: string }>).detail;
      const terminal = getPrimaryTerminal();
      if (!terminal) return;
      void terminal.createTab(label, "", [], cwd);
    }

    window.addEventListener("aidlc:terminal:new-tab", handleNewTab);
    window.addEventListener("aidlc:terminal:close-tab", handleCloseTab);
    window.addEventListener("aidlc:terminal:open-at", handleOpenAt);
    return () => {
      window.removeEventListener("aidlc:terminal:new-tab", handleNewTab);
      window.removeEventListener("aidlc:terminal:close-tab", handleCloseTab);
      window.removeEventListener("aidlc:terminal:open-at", handleOpenAt);
    };
  }, [getPrimaryTerminal]);

  // Opens a new plain shell tab in the primary pane (toolbar + empty state).
  const handleNewTerminal = useCallback(() => {
    const terminal = getPrimaryTerminal();
    if (!terminal) return;
    void terminal.createTab(
      `Terminal ${terminal.tabs.length + 1}`,
      "",
      [],
      workspaceRef.current ?? undefined,
    );
  }, [getPrimaryTerminal]);

  // ── Split callbacks ────────────────────────────────────────────────────────

  const handleSplit = useCallback(
    (paneId: string, direction: SplitDirection) => {
      if (freeSlots.length === 0) return;

      const [nextSlot, ...remainingFree] = freeSlots;
      const newId = makeLeafId();
      const terminal = pool[nextSlot];

      // Open a default shell in the new pane.
      void terminal.createTab("Terminal 1", "", [], workspaceRef.current ?? undefined);

      const newLeaf: LeafPane = {
        kind: "leaf",
        id: newId,
        terminal,
      };

      setRoot((prev) => {
        if (!prev) return prev;
        return splitLeaf(prev, paneId, direction, newLeaf);
      });

      setPaneSlotMap((prev) => {
        const next = new Map(prev);
        next.set(newId, nextSlot);
        return next;
      });

      setFreeSlots(remainingFree);
    },
    [freeSlots, pool],
  );

  function handleUnsplit(paneId: string) {
    setRoot((prev) => {
      if (!prev) return prev;
      const next = unsplitLeaf(prev, paneId);
      return next ?? prev;
    });

    // Return the slot to the pool.
    const slot = paneSlotMap.get(paneId);
    if (slot !== undefined) {
      setPaneSlotMap((prev) => {
        const next = new Map(prev);
        next.delete(paneId);
        return next;
      });
      setFreeSlots((prev) => [...prev, slot].sort());
    }
  }

  // ── Callbacks object (stable reference via object identity not needed —
  //    SplitTerminal doesn't memo on it) ──────────────────────────────────────

  const leafCount = root ? countLeaves(root) : 1;

  const splitCallbacks: SplitCallbacks = {
    getTerminal: getTerminalForPane,
    onSplit: handleSplit,
    onUnsplit: handleUnsplit,
    leafCount,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!root) {
    // Loading state — primary pane not yet initialized.
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)]" />
    );
  }

  // Determine if primary pane has any terminals (for empty state).
  const primaryHasTerminals = pool[0].tabs.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)]">
      {/* Global toolbar: only shown when there are terminals */}
      {primaryHasTerminals && (
        <SplitToolbar
          newTerminalButton={<NewTerminalButton onNewTerminal={handleNewTerminal} />}
        />
      )}

      {/* Main split area */}
      <div
        className={cn(
          "flex-1 min-h-0",
          primaryHasTerminals ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {primaryHasTerminals ? (
          <SplitTerminal root={root} callbacks={splitCallbacks} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <TerminalSquare className="h-12 w-12 text-[var(--color-muted-foreground)]" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--color-foreground)]">
                No terminal open
              </h3>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Open a shell to start working in your workspace.
              </p>
            </div>
            <button
              onClick={handleNewTerminal}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90",
              )}
            >
              <Plus className="h-4 w-4" />
              New Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
