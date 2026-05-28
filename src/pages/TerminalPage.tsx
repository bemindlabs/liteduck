import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Plus } from "lucide-react";
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

// ── Imperative handle ──────────────────────────────────────────────────────────

/**
 * Surface a tiny imperative API so the dock header (TerminalDock) can drive the
 * primary pane without owning its state. The dock renders the chrome; the page
 * owns the pane pool + split tree.
 */
export interface TerminalPageHandle {
  /** Open a fresh shell tab in the primary pane. */
  newTerminal: () => void;
  /** Split the primary pane (raw-PTY split) in the given direction. */
  splitPrimary: (direction: SplitDirection) => void;
  /** Whether another split is possible (≤ 4 panes). */
  canSplit: () => boolean;
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

const TerminalPage = forwardRef<TerminalPageHandle>(function TerminalPage(_props, ref) {
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

  /** Resolve the id of the primary (first) pane leaf. */
  const getPrimaryLeafId = useCallback((): string | null => {
    if (!root) return null;
    return collectLeafIds(root)[0] ?? null;
  }, [root]);

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

  // ── Imperative handle for the dock header ───────────────────────────────────

  const leafCount = root ? countLeaves(root) : 1;

  // Split the primary pane: if it has no shell yet, open one first so the new
  // pane has a sibling to split from.
  const handleSplitPrimary = useCallback(
    (direction: SplitDirection) => {
      const primaryId = getPrimaryLeafId();
      if (!primaryId) return;
      if (pool[0].tabs.length === 0) handleNewTerminal();
      handleSplit(primaryId, direction);
    },
    [getPrimaryLeafId, handleNewTerminal, handleSplit, pool],
  );

  useImperativeHandle(
    ref,
    () => ({
      newTerminal: handleNewTerminal,
      splitPrimary: handleSplitPrimary,
      canSplit: () => leafCount < 4 && pool[0].tabs.length > 0,
    }),
    [handleNewTerminal, handleSplitPrimary, leafCount, pool],
  );

  // ── Callbacks object (stable reference via object identity not needed —
  //    SplitTerminal doesn't memo on it) ──────────────────────────────────────

  const splitCallbacks: SplitCallbacks = {
    getTerminal: getTerminalForPane,
    onSplit: handleSplit,
    onUnsplit: handleUnsplit,
    leafCount,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!root) {
    // Loading state — primary pane not yet initialized.
    return <div className="flex h-full flex-col overflow-hidden bg-[var(--color-background)]" />;
  }

  // Determine if primary pane has any terminals (for empty state).
  const primaryHasTerminals = pool[0].tabs.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-background)]">
      {primaryHasTerminals ? (
        <SplitTerminal root={root} callbacks={splitCallbacks} />
      ) : (
        // Compact empty state — reads well even at a ~200px dock height.
        <div className="flex h-full items-center justify-center px-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>No terminal open.</span>
            <button
              onClick={handleNewTerminal}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
                "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              New Terminal
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default TerminalPage;
