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
 * activity rail, terminal dock, and status bar remain visible.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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

// Re-export for parent forwarding refs of imperative actions (toggles).
export interface WorkspaceShellHandle {
  toggleSidePanel: () => void;
  toggleTerminalDock: () => void;
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
    setTerminalOpen((v) => !v);
  }, []);

  useEffect(() => {
    registerHandle?.({ toggleSidePanel, toggleTerminalDock });
  }, [registerHandle, toggleSidePanel, toggleTerminalDock]);

  // ── Activity rail handler ──────────────────────────────────────────────────

  const handleRailSelect = useCallback(
    (panel: WorkspacePanel) => {
      // Clicking the active icon collapses; otherwise switch to it.
      const collapsing = activePanel === panel;
      setActivePanel(collapsing ? null : panel);

      // Route-replace for full-page panels so deep linking & menus stay in sync.
      if (!collapsing && (panel === "settings" || panel === "notifications")) {
        const target = panel === "settings" ? ROUTES.SETTINGS : ROUTES.NOTIFICATIONS;
        if (location.pathname !== target) {
          void navigate(target);
        }
      }
      // For files/git, leave the URL alone — they're shown in the side panel
      // alongside whatever else (editor / terminal) is currently visible.
      // If the user explicitly went to /settings or /notifications, switching
      // back to files/git in the rail should pull them out of that view.
      if (
        !collapsing &&
        (panel === "files" || panel === "git") &&
        routeOverridesEditor(location.pathname)
      ) {
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ActivityRail active={activePanel} onSelect={handleRailSelect} />

        {activePanel && (
          <SidePanel
            panel={activePanel}
            width={sidePanelWidth}
            onResize={setSidePanelWidth}
            selectedFilePath={activeTabId}
            onFileOpen={handleFileOpen}
          />
        )}

        {/* Editor + Terminal column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {showOutlet ? (
              <div className="h-full overflow-y-auto">
                <Suspense fallback={<PageLoading />}>
                  <Outlet />
                </Suspense>
              </div>
            ) : (
              <EditorArea
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={handleSelectTab}
                onCloseTab={handleCloseTab}
              />
            )}
          </div>

          <TerminalDock open={terminalOpen} onToggle={toggleTerminalDock} />
        </div>
      </div>

      <StatusBar activeEntry={activeEntry} />
    </div>
  );
}
