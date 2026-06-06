/**
 * WorkspaceShell — VS Code-style central workspace.
 *
 * Layout:
 *   ┌──┬─────────────────┬───────────────────────────────────┐
 *   │  │                 │                                   │
 *   │AR│   SidePanel     │            EditorArea             │
 *   │  │ (Files/Git/...) │   ┌───────────────────────────┐   │
 *   │  │                 │   │       TerminalDock        │   │
 *   ├──┴─────────────────┴───┴───────────────────────────┴───┤
 *   │                       StatusBar                         │
 *   └────────────────────────────────────────────────────────┘
 *
 * AR = ActivityRail. The Outlet (for /settings, /notifications) replaces the
 * EditorArea when active so the page renders as a full-area view while the
 * activity rail, terminal dock, and status bar remain visible. The Git view
 * follows the same full-area pattern: when the "git" panel is active GitPage
 * renders in the editor-area slot (not the narrow side panel) so its internal
 * two-column layout has room to breathe.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ActivityRail } from "./ActivityRail";
import { SidePanel } from "./SidePanel";
import { EditorArea } from "./EditorArea";
import { TerminalDock } from "./TerminalDock";
import { StatusBar } from "./StatusBar";
import { type EditorTab, type EditorTabActions } from "./EditorTabs";
import { ROUTES, panelFromPath, type WorkspacePanel } from "@/lib/routes";
import type { FileEntry } from "@/lib/files";
import { type InstalledPlugin, pluginList } from "@/lib/plugins";
import { createLogger } from "@/lib/logger";
import { PageLoading } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const logger = createLogger("WorkspaceShell");

// GitPage is heavy (multi-repo scan, large tabs) — keep lazy. It renders in the
// editor area (full width) when the "git" panel is active, mirroring how the
// settings / notifications Outlets replace the editor area.
const GitPage = lazy(() => import("@/pages/GitPage"));

// PluginsPanel renders full-width in the editor area when the "plugins" panel
// is active, mirroring the GitPage full-area pattern. It is the workspace view
// for LiteDuck's plugin system.
const PluginsPanel = lazy(() =>
  import("@/components/plugins/PluginsPanel").then((m) => ({ default: m.PluginsPanel })),
);

// Re-export for parent forwarding refs of imperative actions (toggles + editor
// tab management, driven from the native menu / keyboard shortcuts in App).
export interface WorkspaceShellHandle {
  toggleSidePanel: () => void;
  toggleTerminalDock: () => void;
  toggleTerminalMaximized: () => void;
  /** Close the active editor tab. Returns false when no editor tab is active. */
  closeActiveTab: () => boolean;
  closeOtherTabs: () => void;
  closeAllTabs: () => void;
  closeTabsToRight: () => void;
  togglePinActiveTab: () => void;
  reopenClosedTab: () => void;
  nextTab: () => void;
  prevTab: () => void;
  /** Activate the nth tab (1-based). No-op when out of range. */
  goToTab: (n: number) => void;
}

/** Keep pinned tabs ahead of unpinned ones, preserving relative order. */
function sortByPinned(tabs: EditorTab[]): EditorTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  return pinned.length === 0 || rest.length === 0 ? tabs : [...pinned, ...rest];
}

interface WorkspaceShellProps {
  /** Forward imperative toggles (Cmd+B / Cmd+`) to parent App layer. */
  registerHandle?: (handle: WorkspaceShellHandle) => void;
}

/**
 * Heuristic: when on /settings or /notifications, the editor area is replaced
 * by the route's Outlet. Otherwise the EditorArea (tabs + FilePreview) renders.
 */
function routeOverridesEditor(pathname: string): boolean {
  return pathname === ROUTES.SETTINGS || pathname === ROUTES.NOTIFICATIONS;
}

export function WorkspaceShell({ registerHandle }: WorkspaceShellProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Layout state ───────────────────────────────────────────────────────────

  /** Which side panel is shown. `null` = collapsed. */
  const [activePanel, setActivePanel] = useState<WorkspacePanel | null>(() => {
    // Initial panel is derived from URL when possible; default to files.
    return panelFromPath(location.pathname) ?? "files";
  });
  /**
   * When set, a specific plugin's **page** surface is open in the editor-area
   * slot (full-width, like Git/Settings). This is *editor-area state only* — it
   * never clears the open file tabs below, so switching back to Files restores
   * them. Set by clicking a pinned `surface: "page"` plugin's rail icon.
   */
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [sidePanelWidth, setSidePanelWidth] = useState(240);
  const [terminalOpen, setTerminalOpen] = useState(true);
  /**
   * When true, the terminal dock fills the full editor+terminal column,
   * hiding the editor-area slot (VS Code's "maximize panel"). The terminal is
   * never unmounted — only the editor slot is hidden — so PTY survives.
   */
  const [terminalMaximized, setTerminalMaximized] = useState(false);

  // ── Editor tab state ───────────────────────────────────────────────────────

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Live snapshots so the tab ops below stay referentially stable (no tabs /
  // activeTabId deps) — the shell registers them once on the imperative handle.
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    tabsRef.current = tabs;
  });
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  });

  // LIFO history of recently closed tabs, for "Reopen Closed Tab".
  const closedTabsRef = useRef<{ entry: FileEntry; pinned: boolean; index: number }[]>([]);

  // ── Pinned plugins (activity-rail icons) ─────────────────────────────────────

  // Installed plugins drive the per-plugin activity-rail icons. Fetched lazily
  // (mirrors PluginsPanel) — only those with `pinned: true` get a rail icon.
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);

  // Re-fetch the installed set. Called on mount and whenever PluginsPanel reports
  // an install / uninstall, so a pinned plugin's rail icon appears the instant it
  // is installed and disappears the instant it is removed (no reload). If the
  // open plugin page was the one uninstalled, fall back to the editor (Files).
  const refreshPlugins = useCallback(async () => {
    try {
      const list = await pluginList();
      setInstalledPlugins(list);
      setActivePluginId((cur) => (cur !== null && !list.some((p) => p.id === cur) ? null : cur));
    } catch (e: unknown) {
      logger.error("Failed to list plugins for activity rail", e);
    }
  }, []);

  // Initial fetch on mount; the setState lives in refreshPlugins (a legitimate
  // data-fetch effect, like the URL↔panel sync below).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pinnedPlugins = useMemo(() => installedPlugins.filter((p) => p.pinned), [installedPlugins]);

  // ── URL ↔ panel sync ───────────────────────────────────────────────────────

  // When the user navigates via shortcut / link, reflect that in the panel.
  // Mapping the external pathname onto local panel state is a valid effect use.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const fromPath = panelFromPath(location.pathname);
    if (fromPath !== null) {
      setActivePanel(fromPath);
    }
    // /terminal route just shows the terminal — keep current panel selection;
    // do not force it. /  (HOME) likewise leaves the panel alone.
  }, [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Imperative toggles ─────────────────────────────────────────────────────

  const toggleSidePanel = useCallback(() => {
    setActivePanel((p) => (p === null ? "files" : null));
  }, []);

  const toggleTerminalDock = useCallback(() => {
    setTerminalOpen((open) => {
      const next = !open;
      // Collapsing wins: un-maximize when the dock is collapsed so reopening
      // restores the normal split rather than springing back to full-screen.
      if (!next) setTerminalMaximized(false);
      return next;
    });
  }, []);

  const toggleTerminalMaximized = useCallback(() => {
    setTerminalMaximized((max) => {
      const next = !max;
      // Maximizing a collapsed dock implicitly opens it first.
      if (next) setTerminalOpen(true);
      return next;
    });
  }, []);

  // ── Activity rail handler ──────────────────────────────────────────────────

  const handleRailSelect = useCallback(
    (panel: WorkspacePanel) => {
      // Selecting any shared panel leaves an open plugin page (its rail icon is
      // mutually exclusive with the shared icons). Tabs are untouched.
      setActivePluginId(null);

      // Settings / notifications are full-page Outlets — the side panel has no
      // useful body for them. Clicking the rail icon just ensures we're on the
      // route; it never expands/collapses a vestigial side panel. (URL→panel
      // sync keeps the rail icon highlighted.)
      if (panel === "settings" || panel === "notifications") {
        const target = panel === "settings" ? ROUTES.SETTINGS : ROUTES.NOTIFICATIONS;
        if (location.pathname !== target) {
          void navigate(target);
        }
        return;
      }

      // Files / git: clicking the active icon collapses; otherwise switch.
      const collapsing = activePanel === panel;
      setActivePanel(collapsing ? null : panel);

      // If the user was on /settings or /notifications, switching to files/git
      // in the rail pulls them out of that view.
      if (!collapsing && routeOverridesEditor(location.pathname)) {
        void navigate(ROUTES.HOME);
      }
    },
    [activePanel, location.pathname, navigate],
  );

  // Clicking a pinned plugin's rail icon opens its full-page surface in the
  // editor-area slot. This only swaps the editor-area *view* — the open file
  // tabs are preserved (switching to Files restores them), exactly like Git /
  // Settings. Re-clicking the active plugin's icon closes it back to Files.
  const handleOpenPluginPage = useCallback(
    (pluginId: string) => {
      setActivePluginId((current) => (current === pluginId ? null : pluginId));
      // Leaving a /settings or /notifications Outlet so the editor-area slot is
      // free to host the plugin page.
      if (routeOverridesEditor(location.pathname)) {
        void navigate(ROUTES.HOME);
      }
    },
    [location.pathname, navigate],
  );

  // ── Editor tab handlers ────────────────────────────────────────────────────

  const MAX_CLOSED = 10;
  const recordClosed = useCallback((tab: EditorTab, index: number) => {
    closedTabsRef.current = [
      { entry: tab.entry, pinned: tab.pinned, index },
      ...closedTabsRef.current,
    ].slice(0, MAX_CLOSED);
  }, []);

  const handleFileOpen = useCallback((entry: FileEntry) => {
    if (entry.is_dir) return;
    setTabs((prev) => {
      if (prev.some((t) => t.id === entry.path)) return prev;
      return [...prev, { id: entry.path, entry, pinned: false }];
    });
    setActiveTabId(entry.path);
  }, []);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  // The neighbour to activate after removing the tab at `idx` from `remaining`.
  const neighbourId = (remaining: EditorTab[], idx: number): string | null =>
    remaining.length === 0 ? null : (remaining[Math.max(0, idx - 1)] ?? remaining[0]).id;

  const closeTab = useCallback(
    (id: string): boolean => {
      const cur = tabsRef.current;
      const idx = cur.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      recordClosed(cur[idx], idx);
      const next = cur.filter((t) => t.id !== id);
      setTabs(next);
      if (activeTabIdRef.current === id) setActiveTabId(neighbourId(next, idx));
      return true;
    },
    [recordClosed],
  );

  const closeActiveTab = useCallback((): boolean => {
    const id = activeTabIdRef.current;
    return id ? closeTab(id) : false;
  }, [closeTab]);

  const closeOtherTabs = useCallback(
    (id: string) => {
      const cur = tabsRef.current;
      cur.forEach((t, i) => {
        if (t.id !== id && !t.pinned) recordClosed(t, i);
      });
      setTabs(cur.filter((t) => t.id === id || t.pinned));
      setActiveTabId(id);
    },
    [recordClosed],
  );

  const closeAllTabs = useCallback(() => {
    const cur = tabsRef.current;
    cur.forEach((t, i) => {
      if (!t.pinned) recordClosed(t, i);
    });
    const kept = cur.filter((t) => t.pinned);
    setTabs(kept);
    setActiveTabId((curId) =>
      kept.some((t) => t.id === curId) ? curId : (kept[kept.length - 1]?.id ?? null),
    );
  }, [recordClosed]);

  const closeTabsToRight = useCallback(
    (id: string) => {
      const cur = tabsRef.current;
      const idx = cur.findIndex((t) => t.id === id);
      if (idx === -1) return;
      cur.forEach((t, i) => {
        if (i > idx && !t.pinned) recordClosed(t, i);
      });
      const kept = cur.filter((t, i) => i <= idx || t.pinned);
      setTabs(kept);
      setActiveTabId((curId) => (kept.some((t) => t.id === curId) ? curId : id));
    },
    [recordClosed],
  );

  const togglePinTab = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab) return prev;
      return sortByPinned(prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
    });
  }, []);

  const togglePinActiveTab = useCallback(() => {
    const id = activeTabIdRef.current;
    if (id) togglePinTab(id);
  }, [togglePinTab]);

  const reorderTab = useCallback((fromId: string, toId: string) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === fromId);
      const to = prev.findIndex((t) => t.id === toId);
      // Only reorder within the same (pinned / unpinned) group.
      if (from === -1 || to === -1 || from === to || prev[from].pinned !== prev[to].pinned) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reopenClosedTab = useCallback(() => {
    if (closedTabsRef.current.length === 0) return;
    const closed = closedTabsRef.current[0];
    closedTabsRef.current = closedTabsRef.current.slice(1);
    setTabs((prev) => {
      if (prev.some((t) => t.id === closed.entry.path)) return prev;
      const next = [...prev];
      next.splice(Math.min(closed.index, next.length), 0, {
        id: closed.entry.path,
        entry: closed.entry,
        pinned: closed.pinned,
      });
      return sortByPinned(next);
    });
    setActiveTabId(closed.entry.path);
  }, []);

  const nextTab = useCallback(() => {
    const cur = tabsRef.current;
    if (cur.length === 0) return;
    const i = cur.findIndex((t) => t.id === activeTabIdRef.current);
    setActiveTabId(cur[(i + 1) % cur.length].id);
  }, []);

  const prevTab = useCallback(() => {
    const cur = tabsRef.current;
    if (cur.length === 0) return;
    const i = cur.findIndex((t) => t.id === activeTabIdRef.current);
    setActiveTabId(cur[(i <= 0 ? cur.length : i) - 1].id);
  }, []);

  const goToTab = useCallback((n: number) => {
    const cur = tabsRef.current;
    if (n >= 1 && n <= cur.length) setActiveTabId(cur[n - 1].id);
  }, []);

  const tabActions: EditorTabActions = useMemo(
    () => ({
      onSelect: handleSelectTab,
      onClose: closeTab,
      onCloseOthers: closeOtherTabs,
      onCloseAll: closeAllTabs,
      onCloseToRight: closeTabsToRight,
      onTogglePin: togglePinTab,
      onReorder: reorderTab,
    }),
    [
      handleSelectTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      closeTabsToRight,
      togglePinTab,
      reorderTab,
    ],
  );

  // Register the imperative handle once all toggles + tab ops are defined, so
  // the native menu / keyboard shortcuts in App can drive them. (Declared here,
  // after the tab ops, to avoid a temporal-dead-zone on the op callbacks.)
  useEffect(() => {
    registerHandle?.({
      toggleSidePanel,
      toggleTerminalDock,
      toggleTerminalMaximized,
      closeActiveTab,
      closeOtherTabs: () => {
        const id = activeTabIdRef.current;
        if (id) closeOtherTabs(id);
      },
      closeAllTabs,
      closeTabsToRight: () => {
        const id = activeTabIdRef.current;
        if (id) closeTabsToRight(id);
      },
      togglePinActiveTab,
      reopenClosedTab,
      nextTab,
      prevTab,
      goToTab,
    });
  }, [
    registerHandle,
    toggleSidePanel,
    toggleTerminalDock,
    toggleTerminalMaximized,
    closeActiveTab,
    closeOtherTabs,
    closeAllTabs,
    closeTabsToRight,
    togglePinActiveTab,
    reopenClosedTab,
    nextTab,
    prevTab,
    goToTab,
  ]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeEntry = useMemo(
    () => tabs.find((t) => t.id === activeTabId)?.entry ?? null,
    [tabs, activeTabId],
  );

  // A pinned plugin's page surface takes precedence over everything else in the
  // editor-area slot (it's the most explicit user action). Open file tabs stay
  // in `tabs` state untouched, so switching back to Files restores them.
  const showPluginPage = activePluginId !== null;

  const showOutlet = !showPluginPage && routeOverridesEditor(location.pathname);

  // Git renders full-width in the editor area (like settings / notifications),
  // never in the narrow side panel — its internal file-list + diff two-column
  // layout is unusable at ~240px. The rail icon still highlights via
  // `activePanel`; the editor area shows GitPage when this is true.
  const showGit = !showPluginPage && activePanel === "git";

  // Plugins render full-width in the editor area too (same pattern as Git):
  // the manifest list + command output need room beyond the ~240px side panel.
  const showPlugins = !showPluginPage && activePanel === "plugins";

  // The side panel only has a useful body for "files". For
  // "git" / "settings" / "notifications" the editor area shows the full page,
  // so the side panel stays collapsed even though the rail icon still
  // highlights via `activePanel`. This is what makes Cmd+, behave like
  // clicking the rail Settings icon (no auto-expand of a vestigial pointer). A
  // plugin page also takes over the editor area, so the files tree hides too.
  const showFilesSidePanel = !showPluginPage && activePanel === "files";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ActivityRail
          active={showPluginPage ? null : activePanel}
          onSelect={handleRailSelect}
          pinnedPlugins={pinnedPlugins}
          activePluginId={activePluginId}
          onSelectPlugin={handleOpenPluginPage}
        />

        {showFilesSidePanel && (
          <SidePanel
            width={sidePanelWidth}
            onResize={setSidePanelWidth}
            selectedFilePath={activeTabId}
            onFileOpen={handleFileOpen}
          />
        )}

        {/* Editor + Terminal column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Editor-area slot — hidden (not unmounted) when the terminal is
              maximized so the dock can fill the full column height. */}
          <div className={cn("flex-1 min-h-0 overflow-hidden", terminalMaximized && "hidden")}>
            {activePluginId !== null ? (
              <Suspense fallback={<PageLoading />}>
                <div className="h-full overflow-hidden">
                  {/* Full-page plugin surface: opens straight to the pinned
                      plugin, auto-running its `default` command. Reuses the
                      PluginsPanel detail renderer via initialPluginId. */}
                  <PluginsPanel
                    initialPluginId={activePluginId}
                    onPluginsChanged={() => void refreshPlugins()}
                  />
                </div>
              </Suspense>
            ) : showOutlet ? (
              <div className="h-full overflow-y-auto">
                <Suspense fallback={<PageLoading />}>
                  <Outlet />
                </Suspense>
              </div>
            ) : showGit ? (
              <Suspense fallback={<PageLoading />}>
                <div className="h-full overflow-y-auto">
                  <GitPage />
                </div>
              </Suspense>
            ) : showPlugins ? (
              <Suspense fallback={<PageLoading />}>
                <div className="h-full overflow-hidden">
                  <PluginsPanel
                    onPluginsChanged={() => void refreshPlugins()}
                    onOpenPluginPage={handleOpenPluginPage}
                  />
                </div>
              </Suspense>
            ) : (
              <EditorArea tabs={tabs} activeTabId={activeTabId} tabActions={tabActions} />
            )}
          </div>

          <TerminalDock
            open={terminalOpen}
            onToggle={toggleTerminalDock}
            maximized={terminalMaximized}
            onToggleMaximized={toggleTerminalMaximized}
          />
        </div>
      </div>

      <StatusBar activeEntry={activeEntry} />
    </div>
  );
}
