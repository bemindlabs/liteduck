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

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ActivityRail } from "./ActivityRail";
import { SidePanel } from "./SidePanel";
import { EditorArea } from "./EditorArea";
import { TerminalDock } from "./TerminalDock";
import { StatusBar } from "./StatusBar";
import { type EditorTab } from "./EditorTabs";
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

// Re-export for parent forwarding refs of imperative actions (toggles).
export interface WorkspaceShellHandle {
  toggleSidePanel: () => void;
  toggleTerminalDock: () => void;
  toggleTerminalMaximized: () => void;
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

  useEffect(() => {
    registerHandle?.({ toggleSidePanel, toggleTerminalDock, toggleTerminalMaximized });
  }, [registerHandle, toggleSidePanel, toggleTerminalDock, toggleTerminalMaximized]);

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

  const handleFileOpen = useCallback((entry: FileEntry) => {
    if (entry.is_dir) return;
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === entry.path);
      if (existing) return prev;
      return [...prev, { id: entry.path, entry }];
    });
    setActiveTabId(entry.path);
  }, []);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      // Compute the neighbour-fallback using the current snapshot. Both setters
      // are called separately so each updater stays pure (no side effects).
      const idx = tabs.findIndex((t) => t.id === id);
      const next = tabs.filter((t) => t.id !== id);
      setTabs(next);
      if (activeTabId === id) {
        if (next.length === 0) {
          setActiveTabId(null);
        } else {
          const fallback = next[Math.max(0, idx - 1)] ?? next[0];
          setActiveTabId(fallback.id);
        }
      }
    },
    [tabs, activeTabId],
  );

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
              <EditorArea
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={handleSelectTab}
                onCloseTab={handleCloseTab}
              />
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
