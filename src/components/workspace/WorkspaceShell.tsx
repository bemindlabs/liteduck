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
import { PageLoading } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  const showOutlet = routeOverridesEditor(location.pathname);

  // Git renders full-width in the editor area (like settings / notifications),
  // never in the narrow side panel — its internal file-list + diff two-column
  // layout is unusable at ~240px. The rail icon still highlights via
  // `activePanel`; the editor area shows GitPage when this is true.
  const showGit = activePanel === "git";

  // Plugins render full-width in the editor area too (same pattern as Git):
  // the manifest list + command output need room beyond the ~240px side panel.
  const showPlugins = activePanel === "plugins";

  // The side panel only has a useful body for "files". For
  // "git" / "settings" / "notifications" the editor area shows the full page,
  // so the side panel stays collapsed even though the rail icon still
  // highlights via `activePanel`. This is what makes Cmd+, behave like
  // clicking the rail Settings icon (no auto-expand of a vestigial pointer).
  const showFilesSidePanel = activePanel === "files";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ActivityRail active={activePanel} onSelect={handleRailSelect} />

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
            {showOutlet ? (
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
                  <PluginsPanel />
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
