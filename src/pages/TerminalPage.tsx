import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, Plus, SquarePlus, TerminalSquare } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminal } from "@/hooks/useTerminal";
import type { UseTerminalReturn, TmuxSessionInfo } from "@/hooks/useTerminal";
import TmuxSessionPicker from "@/components/TmuxSessionPicker";
import SplitTerminal, {
  type LeafPane,
  type PaneNode,
  type SplitCallbacks,
  type SplitDirection,
} from "@/components/SplitTerminal";
import { countLeaves, splitLeaf, unsplitLeaf, collectLeafIds } from "@/utils/splitTerminalUtils";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { createLogger } from "@/lib/logger";

const logger = createLogger("TerminalPage");

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
  onOpenSessionPicker: () => void;
  /** Primary terminal for tmux shortcuts */
  primaryTerminal: UseTerminalReturn | null;
  /** Active tab ID from primary terminal (to trigger re-render) */
  activeTabId: string | null;
}

function SplitToolbar({
  newTerminalButton,
  onOpenSessionPicker,
  primaryTerminal,
  activeTabId,
}: SplitToolbarProps) {
  const activeTab = primaryTerminal?.tabs.find((t) => t.id === activeTabId);
  const isTmuxTab = Boolean(activeTab?.tmuxSession);

  // Debug logging
  useEffect(() => {
    console.log("[SplitToolbar] State:", {
      activeTabId,
      tabsCount: primaryTerminal?.tabs.length,
      activeTab: activeTab
        ? { id: activeTab.id, label: activeTab.label, tmuxSession: activeTab.tmuxSession }
        : null,
      isTmuxTab,
    });
  }, [activeTabId, primaryTerminal?.tabs.length, activeTab, isTmuxTab]);

  const handleTmuxNewWindow = useCallback(() => {
    console.log("[handleTmuxNewWindow] Called", {
      activeTabId: activeTab?.id,
      hasSessionId: !!activeTab?.sessionId,
      tmuxSession: activeTab?.tmuxSession,
    });
    if (!activeTab?.id) {
      console.warn("[handleTmuxNewWindow] No active tab ID");
      return;
    }
    console.log("[handleTmuxNewWindow] Calling tmuxNewWindow with tabId:", activeTab.id);
    void primaryTerminal?.tmuxNewWindow(activeTab.id);
  }, [primaryTerminal, activeTab]);

  const handleTmuxNextWindow = useCallback(() => {
    if (!activeTab?.id) return;
    void primaryTerminal?.tmuxNextWindow(activeTab.id);
  }, [primaryTerminal, activeTab]);

  const handleTmuxPrevWindow = useCallback(() => {
    if (!activeTab?.id) return;
    void primaryTerminal?.tmuxPrevWindow(activeTab.id);
  }, [primaryTerminal, activeTab]);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-2">
      <span className="mr-auto text-xs font-medium text-[var(--color-muted-foreground)]">
        Terminal {isTmuxTab && `(tmux: ${activeTab?.tmuxSession})`}
      </span>

      {/* Tmux window controls - only shown when active tab is tmux-backed */}
      {isTmuxTab && (
        <>
          <button
            onClick={handleTmuxNewWindow}
            className={toolbarBtnCls}
            title="New tmux window (Ctrl-B c)"
            aria-label="Create new tmux window"
          >
            <SquarePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Window</span>
          </button>
          <button
            onClick={handleTmuxPrevWindow}
            className={toolbarBtnCls}
            title="Previous tmux window (Ctrl-B p)"
            aria-label="Switch to previous tmux window"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleTmuxNextWindow}
            className={toolbarBtnCls}
            title="Next tmux window (Ctrl-B n)"
            aria-label="Switch to next tmux window"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {/* Divider */}
          <div className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
        </>
      )}

      {/* Sessions picker button */}
      <button
        onClick={onOpenSessionPicker}
        className={toolbarBtnCls}
        title="tmux sessions"
        aria-label="Open tmux session picker"
      >
        <Layers className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sessions</span>
      </button>

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

    // Restore any existing tmux sessions into the primary pane's tab bar.
    // When tmux is not installed or there are no existing sessions, this is a
    // no-op and the AgentLauncher welcome screen is shown as usual.
    void invoke<TmuxSessionInfo[]>("terminal_list_tmux")
      .catch(() => [] as TmuxSessionInfo[])
      .then(async (sessions) => {
        // Filter sessions by workspace path if workspace is set
        const workspacePath = workspaceRef.current;
        const filteredSessions = workspacePath
          ? sessions.filter((sess) => sess.path === workspacePath)
          : sessions;

        logger.info(
          `Found ${sessions.length} tmux sessions, ${filteredSessions.length} match workspace "${workspacePath ?? "none"}"`,
        );

        for (const sess of filteredSessions) {
          // Re-attach to each existing tmux session using a dedicated PTY.
          await pool[0]
            .attachTmuxSession(sess.name)
            .catch((err: unknown) =>
              logger.warn(`Failed to re-attach tmux session "${sess.name}":`, err),
            );
        }
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

  // ── Session picker state ───────────────────────────────────────────────────

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  /** Attach a named tmux session into the first pane's tab bar. */
  const handleAttachSession = useCallback(
    (sessionName: string) => {
      const terminal = getPrimaryTerminal();
      if (!terminal) return;
      terminal.attachTmuxSession(sessionName).catch((err: unknown) => {
        logger.warn(`Failed to attach tmux session "${sessionName}":`, err);
      });
    },
    [getPrimaryTerminal],
  );

  /** Create a brand-new tmux session with a generated name and attach it. */
  const handleNewTmuxSession = useCallback(() => {
    const terminal = getPrimaryTerminal();
    if (!terminal) return;
    const label = `Terminal ${terminal.tabs.length + 1}`;
    void terminal.createTab(label, "", [], workspaceRef.current ?? undefined);
  }, [getPrimaryTerminal]);

  // ── Global keyboard shortcut event listeners ───────────────────────────────

  useEffect(() => {
    function handleNewTab() {
      const terminal = getPrimaryTerminal();
      if (!terminal) return;

      // If the active tab is tmux-backed, create a new window inside that
      // tmux session instead of spawning a separate session.
      const activeTab = terminal.tabs.find((t) => t.id === terminal.activeTabId);
      if (activeTab?.tmuxSession && activeTab.sessionId) {
        void terminal.tmuxNewWindow(activeTab.id);
        return;
      }

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

  // Handler for tmux-level pane splits. Looks up the active tab in the target
  // pane and delegates to the hook's tmuxSplitPane method.
  const handleTmuxSplit = useCallback(
    (paneId: string, horizontal: boolean) => {
      const terminal = getTerminalForPane(paneId);
      if (!terminal?.activeTabId) return;
      terminal
        .tmuxSplitPane(terminal.activeTabId, horizontal)
        .catch((err: unknown) => logger.error("tmuxSplitPane failed:", err));
    },
    [getTerminalForPane],
  );

  const splitCallbacks: SplitCallbacks = {
    getTerminal: getTerminalForPane,
    onSplit: handleSplit,
    onUnsplit: handleUnsplit,
    onTmuxSplit: handleTmuxSplit,
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
      {/* tmux session picker dialog */}
      <TmuxSessionPicker
        open={sessionPickerOpen}
        onClose={() => setSessionPickerOpen(false)}
        onAttach={handleAttachSession}
        onNewSession={handleNewTmuxSession}
      />

      {/* Global toolbar: only shown when there are terminals */}
      {primaryHasTerminals && (
        <SplitToolbar
          onOpenSessionPicker={() => setSessionPickerOpen(true)}
          primaryTerminal={pool[0]}
          activeTabId={pool[0].activeTabId}
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
