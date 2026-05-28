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
}

/** Shape returned by the `terminal_create` Tauri command. */
interface CreateSessionResult {
  session_id: string;
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
  closeTab: (tabId: string) => void;
  writeToSession: (tabId: string, data: string) => Promise<void>;
  resizeSession: (tabId: string, cols: number, rows: number) => Promise<void>;
  registerXterm: (tabId: string, xterm: import("@xterm/xterm").Terminal) => void;
  unregisterXterm: (tabId: string) => void;
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
    // removed by React StrictMode double-mount.  Tauri types UnlistenFn as
    // `() => void`, but at runtime it returns a promise that rejects when the
    // listener is already gone; coerce to a promise so we catch both the
    // synchronous throw and the asynchronous rejection.
    const safeUnlisten = (fn: UnlistenFn) => {
      try {
        void Promise.resolve(fn() as unknown).catch(() => {
          // Listener already removed — nothing to clean up.
        });
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

    // Subscribe to pty-closed events. If the event arrives before
    // sessionToTab is populated (race condition), buffer it so createTab can
    // replay it.
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

      // Auto-close the tab after a short delay.
      setTimeout(() => {
        setTabs((prev) => {
          const tab = prev.find((t) => t.id === tabId);
          if (tab && !tab.running) {
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

        // Sanitised session-name hint preserved for API compatibility — the
        // backend currently ignores it but still accepts the field.
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

        const { session_id: sessionId } = result;
        sessionToTab.current.set(sessionId, tabId);

        // Replay any pty-closed event that arrived before the mapping was set.
        const closedEarly = pendingClosed.current.delete(sessionId);

        // Sync PTY size to the xterm's current dimensions. FitAddon may have
        // resized xterm before terminal_create resolved; that earlier resize
        // callback was a no-op because sessionId was still null on the tab,
        // leaving the PTY stuck at the default 80x24.
        const xtermNow = xtermRefs.current.get(tabId);
        if (xtermNow) {
          void invoke("terminal_resize", {
            sessionId,
            cols: xtermNow.cols,
            rows: xtermNow.rows,
          }).catch((err: unknown) => logger.error("initial terminal_resize failed:", err));
        }

        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  sessionId,
                  running: !closedEarly,
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

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    createTab,
    closeTab,
    writeToSession,
    resizeSession,
    registerXterm,
    unregisterXterm,
  };
}
