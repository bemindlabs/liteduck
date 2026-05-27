import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Terminal as XTerm } from "@xterm/xterm";
import { createLogger } from "@/lib/logger";
import { addNotification } from "@/lib/notifications";

const logger = createLogger("useTerminal");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TerminalTab {
  id: string;
  /** Display label shown in the tab bar. */
  label: string;
  sessionId: string | null;
  running: boolean;
  /** When set, this tab is connected to a named tmux session. */
  tmuxSession?: string;
}

/** Shape returned by the `terminal_list_tmux` Tauri command. */
export interface TmuxSessionInfo {
  name: string;
  windows: number;
  /** Unix timestamp (seconds) as a string — format with `new Date(+created * 1000)`. */
  created: string;
  attached: boolean;
  /** Working directory of the session (session_path). */
  path: string;
}

/** Shape returned by the `terminal_create` Tauri command. */
interface CreateSessionResult {
  session_id: string;
  /** When tmux was used, the tmux session name (e.g. "aidlc-0"). Null when raw PTY fallback. */
  tmux_session: string | null;
}

interface PtyOutputEvent {
  session_id: string;
  data: string;
}

/** Payload for the "pty-closed" event — just the session UUID string. */
type PtyClosedEvent = string;

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseTerminalReturn {
  tabs: TerminalTab[];
  activeTabId: string | null;
  setActiveTabId: (id: string) => void;
  createTab: (
    label: string,
    command: string,
    args: string[],
    cwd?: string,
    cols?: number,
    rows?: number,
  ) => Promise<string>;
  /**
   * Attach to an existing tmux session and open it as a new tab.
   * The tab label is derived from the tmux session name.
   *
   * Falls back gracefully: if tmux is not available the Tauri command will
   * return an error and this method will throw.
   */
  attachTmuxSession: (tmuxSession: string, cols?: number, rows?: number) => Promise<string>;
  closeTab: (tabId: string) => void;
  /**
   * Permanently kill the tmux session backing a tab (tmux kill-session), then
   * close the tab.  Has no effect if the tab does not have an associated tmux
   * session.  Throws if the Tauri command fails.
   */
  killTmuxSession: (tabId: string) => Promise<void>;
  /**
   * Kill ALL tmux sessions across all open tabs and close each tab.
   * Tabs without a tmux session are closed normally (PTY detached).
   * Errors from individual kills are logged but do not abort the rest.
   */
  killAllTmuxSessions: () => Promise<void>;
  /**
   * Rename the tmux session backing a tab.  Updates both the tmux session name
   * and the tab's `label` / `tmuxSession` fields.  Throws if the Tauri command
   * fails (e.g. tmux not installed or session not found).
   *
   * For non-tmux tabs the label is updated locally without calling the backend.
   */
  renameTmuxSession: (tabId: string, newName: string) => Promise<void>;
  writeToSession: (tabId: string, data: string) => Promise<void>;
  resizeSession: (tabId: string, cols: number, rows: number) => Promise<void>;
  registerXterm: (tabId: string, xterm: import("@xterm/xterm").Terminal) => void;
  unregisterXterm: (tabId: string) => void;
  /**
   * Send a tmux split-window keystroke to the PTY session backing `tabId`.
   *
   * `horizontal: true`  → side-by-side split  (tmux `split-window -h`, Ctrl-B %)
   * `horizontal: false` → top/bottom split     (tmux `split-window -v`, Ctrl-B ")
   *
   * Silently no-ops when the tab has no active session or is not tmux-backed.
   */
  tmuxSplitPane: (tabId: string, horizontal: boolean) => Promise<void>;
  /** Create a new window inside the tmux session backing `tabId`. */
  tmuxNewWindow: (tabId: string) => Promise<void>;
  /** Switch to the next tmux window. */
  tmuxNextWindow: (tabId: string) => Promise<void>;
  /** Switch to the previous tmux window. */
  tmuxPrevWindow: (tabId: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTerminal(): UseTerminalReturn {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Keyed by tabId → xterm instance. Mutable ref so we don't trigger re-renders
  // just because a terminal was registered.
  const xtermRefs = useRef(new Map<string, XTerm>());

  // Stable map from sessionId → tabId for fast lookup in the event handler.
  const sessionToTab = useRef(new Map<string, string>());

  // Buffer pty-closed events that arrive before sessionToTab is populated.
  const pendingClosed = useRef(new Set<string>());

  const unlistenRef = useRef<UnlistenFn | null>(null);
  const unlistenClosedRef = useRef<UnlistenFn | null>(null);

  // Subscribe once to all pty-output events; route output to the right xterm.
  useEffect(() => {
    let cancelled = false;

    // Safely call an unlisten function — swallow errors from listeners already
    // removed by React StrictMode double-mount.  Tauri's unlisten may reject
    // asynchronously; we attach a global rejection handler below.
    const safeUnlisten = (fn: UnlistenFn) => {
      try {
        fn();
      } catch {
        // Listener already removed — nothing to clean up.
      }
    };

    void listen<PtyOutputEvent>("pty-output", (event) => {
      const { session_id, data } = event.payload;
      const tabId = sessionToTab.current.get(session_id);
      if (!tabId) return;
      const term = xtermRefs.current.get(tabId);
      if (term) term.write(data);
    }).then((fn) => {
      if (cancelled) {
        safeUnlisten(fn);
      } else {
        unlistenRef.current = fn;
      }
    });

    // Subscribe to pty-closed events to reflect externally killed tmux sessions.
    // If the event arrives before sessionToTab is populated (race condition),
    // buffer it so createTab/attachTmuxSession can replay it.
    void listen<PtyClosedEvent>("pty-closed", (event) => {
      const session_id = event.payload;
      const tabId = sessionToTab.current.get(session_id);
      if (!tabId) {
        // Session mapping not yet set — buffer for later replay.
        pendingClosed.current.add(session_id);
        return;
      }

      // Mark the tab as not running
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: false } : t)));

      // Auto-close the tab after a short delay (only for non-tmux tabs)
      setTimeout(() => {
        setTabs((prev) => {
          const tab = prev.find((t) => t.id === tabId);
          // Only auto-close if it's not a tmux session (tmux sessions should stay open)
          if (tab && !tab.tmuxSession && !tab.running) {
            sessionToTab.current.delete(tab.sessionId ?? "");
            return prev.filter((t) => t.id !== tabId);
          }
          return prev;
        });
      }, 1000); // 1 second delay before auto-closing
    }).then((fn) => {
      if (cancelled) {
        safeUnlisten(fn);
      } else {
        unlistenClosedRef.current = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenRef.current) safeUnlisten(unlistenRef.current);
      if (unlistenClosedRef.current) safeUnlisten(unlistenClosedRef.current);
    };
  }, []);

  // Ensure activeTabId stays valid when tabs change.
  const tabsRef = useRef(tabs);
  // eslint-disable-next-line react-hooks/refs
  tabsRef.current = tabs;

  // ── Tab management ──────────────────────────────────────────────────────────

  /**
   * Creates a new terminal tab and spawns a PTY session.
   * @param label     Display name for the tab.
   * @param command   Executable to run. Pass empty string for the default shell.
   * @param args      Arguments array.
   * @param cwd       Working directory (optional).
   * @param cols      Initial column count (default 80).
   * @param rows      Initial row count (default 24).
   */
  const createTab = useCallback(
    async (
      label: string,
      command: string,
      args: string[],
      cwd?: string,
      cols = 80,
      rows = 24,
    ): Promise<string> => {
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newTab: TerminalTab = {
        id: tabId,
        label,
        sessionId: null,
        running: false,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);

      try {
        // Pass empty string for cmd so Rust falls back to the system shell.
        const resolvedCmd = command.trim();

        // Derive a tmux-safe session name from the tab label so each tab maps
        // 1:1 to a named tmux session.  The Rust backend applies the same
        // sanitisation rules (whitespace → `-`, non-safe chars stripped,
        // 64-char truncation), so this is just a lightweight preview that
        // keeps the returned `tmux_session` name predictable for the UI.
        const sessionName =
          label
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-zA-Z0-9._-]/g, "")
            .slice(0, 64) || undefined;

        const result = await invoke<CreateSessionResult>("terminal_create", {
          cmd: resolvedCmd,
          args,
          cwd: cwd ?? "",
          cols,
          rows,
          sessionName,
        });

        const { session_id: sessionId, tmux_session: tmuxSession } = result;
        sessionToTab.current.set(sessionId, tabId);

        // Replay any pty-closed event that arrived before the mapping was set.
        const closedEarly = pendingClosed.current.delete(sessionId);

        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  sessionId,
                  running: !closedEarly,
                  // Prefer the actual tmux session name returned by the backend
                  // (it is always the authoritative sanitised name).  Only fall
                  // back to the supplied label when tmux is not in use.
                  label: tmuxSession ?? t.label,
                  tmuxSession: tmuxSession ?? undefined,
                }
              : t,
          ),
        );
      } catch (err) {
        logger.error("terminal_create failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        addNotification("system", "Terminal failed", msg);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: false } : t)));
      }

      return tabId;
    },
    [],
  );

  /**
   * Open a new tab connected to an existing tmux session via `terminal_attach`.
   * Returns the new tab ID.
   */
  const attachTmuxSession = useCallback(
    async (tmuxSession: string, cols = 80, rows = 24): Promise<string> => {
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newTab: TerminalTab = {
        id: tabId,
        label: tmuxSession,
        sessionId: null,
        running: false,
        tmuxSession,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);

      try {
        const sessionId = await invoke<string>("terminal_attach", {
          tmuxSession,
          cols,
          rows,
        });

        sessionToTab.current.set(sessionId, tabId);

        const closedEarly = pendingClosed.current.delete(sessionId);

        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, sessionId, running: !closedEarly } : t)),
        );
      } catch (err) {
        logger.error("terminal_attach failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        addNotification("system", "Terminal attach failed", msg);
        // Remove the dead tab instead of leaving it in a non-running state
        setTabs((prev) => prev.filter((t) => t.id !== tabId));
        setActiveTabId((prev) => {
          if (prev !== tabId) return prev;
          const remaining = tabsRef.current.filter((t) => t.id !== tabId);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        });
        throw err;
      }

      return tabId;
    },
    [],
  );

  const closeTab = useCallback((tabId: string) => {
    // Delete session mapping eagerly (before state update) so pty-closed
    // events that arrive during the React batch don't find a stale mapping.
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      sessionToTab.current.delete(tab.sessionId);
      invoke("terminal_close", { sessionId: tab.sessionId }).catch((err: unknown) =>
        logger.error("terminal_close failed:", err),
      );
    }

    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      // Derive the next active tab from the filtered list (avoids stale ref
      // when multiple tabs are closed rapidly).
      setActiveTabId((prevActive) => {
        if (prevActive !== tabId) return prevActive;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });

    xtermRefs.current.delete(tabId);
  }, []);

  /**
   * Permanently destroy the tmux session associated with `tabId`, then close
   * the tab.  Calls `terminal_kill_tmux` which runs `tmux kill-session -t
   * {name}`.  If the tab has no tmux session this is a no-op (the tab is still
   * closed via `closeTab`).
   */
  const killTmuxSession = useCallback(
    async (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);

      if (tab?.tmuxSession) {
        try {
          await invoke("terminal_kill_tmux", { tmuxSession: tab.tmuxSession });
          logger.info(`Successfully killed tmux session: ${tab.tmuxSession}`);
        } catch (err) {
          logger.error(`Failed to kill tmux session "${tab.tmuxSession}":`, err);
          // Continue to close the tab even if kill failed
        }
      }

      // Always close the tab regardless of kill success/failure
      closeTab(tabId);
    },
    [closeTab],
  );

  /**
   * Kill ALL tmux-backed tabs: runs `terminal_kill_tmux` for each session then
   * closes the tab.  Non-tmux tabs are closed via `closeTab`.
   * Individual kill failures are logged and do not abort subsequent kills.
   */
  const killAllTmuxSessions = useCallback(async () => {
    const snapshot = [...tabsRef.current];
    const results = await Promise.allSettled(
      snapshot.map(async (tab) => {
        if (tab.tmuxSession) {
          await invoke("terminal_kill_tmux", { tmuxSession: tab.tmuxSession });
        }
        closeTab(tab.id);
      }),
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const tab = snapshot[index];
        logger.error(`killAllTmuxSessions: failed for tab "${tab.id}":`, result.reason);
      }
    });
  }, [closeTab]);

  /**
   * Rename the tmux session (if any) backing `tabId` and update the tab label.
   * For plain (non-tmux) tabs only the label is updated locally.
   */
  const renameTmuxSession = useCallback(async (tabId: string, newName: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.tmuxSession) {
      try {
        await invoke("terminal_rename_tmux", {
          oldName: tab.tmuxSession,
          newName,
        });
      } catch (err: unknown) {
        logger.error("terminal_rename_tmux failed:", err);
        return; // Don't update frontend if backend rename failed
      }
    }

    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, label: newName, tmuxSession: t.tmuxSession ? newName : t.tmuxSession }
          : t,
      ),
    );
  }, []);

  const writeToSession = useCallback(async (tabId: string, data: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab?.sessionId) return;
    await invoke("terminal_write", {
      sessionId: tab.sessionId,
      data,
    }).catch((err: unknown) => logger.error("terminal_write failed:", err));
  }, []);

  const resizeSession = useCallback(async (tabId: string, cols: number, rows: number) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab?.sessionId) return;
    await invoke("terminal_resize", {
      sessionId: tab.sessionId,
      cols,
      rows,
    }).catch((err: unknown) => logger.error("terminal_resize failed:", err));
  }, []);

  const registerXterm = useCallback((tabId: string, xterm: XTerm) => {
    xtermRefs.current.set(tabId, xterm);
  }, []);

  const unregisterXterm = useCallback((tabId: string) => {
    xtermRefs.current.delete(tabId);
  }, []);

  /**
   * Split the tmux pane inside the session backing `tabId`.
   * Only meaningful for tmux-backed tabs; silently skips non-tmux tabs.
   */
  const tmuxSplitPane = useCallback(async (tabId: string, horizontal: boolean) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    // Only send the keystroke when the tab has an active tmux-backed session.
    if (!tab?.sessionId || !tab.tmuxSession) return;
    await invoke("terminal_tmux_split", {
      sessionId: tab.sessionId,
      horizontal,
    }).catch((err: unknown) => logger.error("terminal_tmux_split failed:", err));
  }, []);

  const tmuxNewWindow = useCallback(async (tabId: string) => {
    console.log("[tmuxNewWindow] Called with tabId:", tabId);
    const tab = tabsRef.current.find((t) => t.id === tabId);
    console.log("[tmuxNewWindow] Found tab:", {
      found: !!tab,
      sessionId: tab?.sessionId,
      tmuxSession: tab?.tmuxSession,
    });
    if (!tab?.sessionId || !tab.tmuxSession) {
      console.warn("[tmuxNewWindow] Missing sessionId or tmuxSession");
      return;
    }
    console.log("[tmuxNewWindow] Invoking terminal_tmux_new_window with sessionId:", tab.sessionId);
    await invoke("terminal_tmux_new_window", { sessionId: tab.sessionId }).catch((err: unknown) =>
      logger.error("terminal_tmux_new_window failed:", err),
    );
  }, []);

  const tmuxNextWindow = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab?.sessionId || !tab.tmuxSession) return;
    await invoke("terminal_tmux_next_window", { sessionId: tab.sessionId }).catch((err: unknown) =>
      logger.error("terminal_tmux_next_window failed:", err),
    );
  }, []);

  const tmuxPrevWindow = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab?.sessionId || !tab.tmuxSession) return;
    await invoke("terminal_tmux_prev_window", { sessionId: tab.sessionId }).catch((err: unknown) =>
      logger.error("terminal_tmux_prev_window failed:", err),
    );
  }, []);

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    createTab,
    attachTmuxSession,
    closeTab,
    killTmuxSession,
    killAllTmuxSessions,
    renameTmuxSession,
    writeToSession,
    resizeSession,
    registerXterm,
    unregisterXterm,
    tmuxSplitPane,
    tmuxNewWindow,
    tmuxNextWindow,
    tmuxPrevWindow,
  };
}
