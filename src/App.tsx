import { lazy, Suspense, useState, useCallback, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { shouldShowWizard, shouldShowWizardForWorkspace } from "@/lib/wizard";
import { WorkspaceShell, type WorkspaceShellHandle } from "@/components/workspace/WorkspaceShell";

// Lazy-loaded pages — split into separate chunks for faster initial load.
// (FilesPage/GitPage are owned by WorkspaceShell on native; SidePanel imports
// GitPage lazily there. On non-native they are not reachable so they aren't
// referenced here anymore.)
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const WizardPage = lazy(() => import("@/pages/WizardPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageLoading } from "@/components/ui/skeleton";
import { useNotificationAnnouncer } from "@/hooks/useNotificationAnnouncer";
import { createLogger } from "@/lib/logger";

const logger = createLogger("App");
import { CommandPalette } from "@/components/CommandPalette";
import { DragGhost } from "@/components/DragGhost";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { Header } from "@/components/Header";
import {
  useKeyboardShortcuts,
  resolveBindings,
  loadShortcutOverrides,
} from "@/hooks/useKeyboardShortcuts";
import { useMenuEvents } from "@/hooks/useMenuEvents";
import { useSuppressNativeContextMenu } from "@/hooks/useSuppressNativeContextMenu";
import { useFontZoom } from "@/hooks/useFontZoom";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { hasNativeCapabilities } from "@/lib/platform";
import { getSetting, saveSetting } from "@/lib/settings";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";
import { openNewWindow } from "@/lib/window";
import { BiometricProvider } from "@/contexts/BiometricContext";
import { BiometricLockScreen } from "@/components/BiometricLockScreen";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getAppVersion } from "@/lib/version";
import { useWindowSize, BREAKPOINTS } from "@/hooks/useWindowSize";

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * Layout must be a child of BrowserRouter so it can call useNavigate().
 * It owns the command palette and shortcuts help overlay state and wires the
 * keyboard shortcut hook.
 */
function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Kill the native WebView right-click menu app-wide (editable fields exempt).
  useSuppressNativeContextMenu();

  // App-wide zoom: Cmd/Ctrl +/− adjusts the overall UI/text size, Cmd/Ctrl+0 resets.
  useFontZoom();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = useCallback((open?: boolean) => {
    setMobileSidebarOpen((v) => {
      const next = open ?? !v;
      if (next && "vibrate" in navigator) navigator.vibrate(10);
      return next;
    });
  }, []);

  const [isDark, setIsDark] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  const { width: windowWidth } = useWindowSize();
  const isMobileLayout = windowWidth < BREAKPOINTS.md;

  // Auto-close mobile sidebar on resize to desktop or route change.
  // These effects synchronize UI state with external layout changes (window
  // resize / navigation), which is exactly what effects are for.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isMobileLayout) setMobileSidebarOpen(false);
  }, [isMobileLayout]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load app version from Rust backend
  useEffect(() => {
    void getAppVersion().then(setAppVersion);
  }, []);

  const { workspace } = useWorkspace();

  // Redirect to wizard on first launch
  useEffect(() => {
    void shouldShowWizard().then((show) => {
      if (show) void navigate(ROUTES.WIZARD, { replace: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect to wizard when switching to a workspace for the first time
  useEffect(() => {
    if (!workspace) return;
    void shouldShowWizardForWorkspace(workspace).then((show) => {
      if (show) void navigate(ROUTES.WIZARD, { replace: true });
    });
  }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted theme on mount
  useEffect(() => {
    void getSetting("theme")
      .then((val) => {
        let dark: boolean;
        if (val === "system") {
          dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        } else {
          dark = val !== "light";
        }
        setIsDark(dark);
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.classList.toggle("light", !dark);
        // Sync body & theme-color for iOS safe area gap
        const bg = dark ? "#0f0b16" : "#f5f3f8";
        document.body.style.backgroundColor = bg;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
      })
      .catch((err: unknown) => {
        logger.warn("Failed to load theme setting", err);
      });
  }, []);

  const nativeCapable = hasNativeCapabilities();

  // Resolve user-customised bindings on first render (localStorage is sync).
  const [bindings] = useState(() => resolveBindings(loadShortcutOverrides()));

  // Imperative handle on the workspace shell — wired up by the shell on mount
  // so Cmd+B / Cmd+` can toggle the side panel and terminal dock without prop
  // drilling through the keyboard-shortcuts hook.
  const shellHandleRef = useRef<WorkspaceShellHandle | null>(null);
  const registerShellHandle = useCallback((handle: WorkspaceShellHandle) => {
    shellHandleRef.current = handle;
  }, []);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.classList.toggle("light", !next);
      // Update body & theme-color to cover iOS safe area gap
      const bg = next ? "#0f0b16" : "#f5f3f8";
      document.body.style.backgroundColor = bg;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
      void saveSetting("theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  const handleOpenShortcutsHelp = useCallback(() => {
    setShortcutsOpen(true);
  }, []);

  // Cmd+T / Cmd+W are terminal-specific actions. Rather than prop-drilling
  // through the router, we dispatch custom DOM events that TerminalPage can
  // listen for.
  const handleNewTerminalTab = useCallback(() => {
    window.dispatchEvent(new CustomEvent("aidlc:terminal:new-tab"));
  }, []);

  const handleCloseTerminalTab = useCallback(() => {
    window.dispatchEvent(new CustomEvent("aidlc:terminal:close-tab"));
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  const handleToggleSidePanel = useCallback(() => {
    shellHandleRef.current?.toggleSidePanel();
  }, []);

  const handleToggleTerminalDock = useCallback(() => {
    shellHandleRef.current?.toggleTerminalDock();
  }, []);

  const handleToggleTerminalMaximize = useCallback(() => {
    shellHandleRef.current?.toggleTerminalMaximized();
  }, []);

  // Multi-window — File menu hooks. "New Window" clones this window's
  // workspace into a new top-level window; "New Window with Workspace..."
  // lands the new window at /landing so the user can pick.
  const handleNewWindow = useCallback(() => {
    void openNewWindow(workspace || undefined).catch((err: unknown) => {
      logger.warn("Failed to open new window", err);
    });
  }, [workspace]);

  const handleNewWindowPick = useCallback(() => {
    void openNewWindow(undefined).catch((err: unknown) => {
      logger.warn("Failed to open new window (picker)", err);
    });
  }, []);

  useKeyboardShortcuts({
    bindings,
    navigate,
    onOpenCommandPalette: handleOpenCommandPalette,
    onOpenShortcutsHelp: handleOpenShortcutsHelp,
    onNewTerminalTab: handleNewTerminalTab,
    onCloseTerminalTab: handleCloseTerminalTab,
    onToggleFocusMode: handleToggleFocusMode,
    onToggleSidePanel: handleToggleSidePanel,
    onToggleTerminalDock: handleToggleTerminalDock,
    onToggleTerminalMaximize: handleToggleTerminalMaximize,
  });

  useMenuEvents({
    navigate,
    onToggleSidebar: useCallback(() => {
      if (isMobileLayout) {
        toggleMobileSidebar();
        return;
      }
      // On native, the outer Sidebar is replaced by the WorkspaceShell's
      // ActivityRail + SidePanel. Route "toggle sidebar" menu commands to the
      // shell's collapse toggle so the View menu / Cmd+B do the same thing.
      if (nativeCapable) {
        shellHandleRef.current?.toggleSidePanel();
        return;
      }
      setSidebarCollapsed((v) => !v);
    }, [isMobileLayout, toggleMobileSidebar, nativeCapable]),
    onOpenCommandPalette: handleOpenCommandPalette,
    onToggleDark: toggleDark,
    onToggleFocusMode: handleToggleFocusMode,
    onNewTerminalTab: handleNewTerminalTab,
    onCloseTerminalTab: handleCloseTerminalTab,
    onOpenShortcutsHelp: handleOpenShortcutsHelp,
    onNewWindow: handleNewWindow,
    onNewWindowPick: handleNewWindowPick,
  });

  // Exit focus mode on Escape
  useEffect(() => {
    if (!focusMode) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [focusMode]);

  return (
    <div className="safe-area-pad flex flex-1 h-full overflow-hidden bg-[var(--color-background)]">
      {/* Skip navigation link — visible only on keyboard focus (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:rounded-md focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-primary-foreground)] focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Sidebar — kept on non-native (mobile) builds only. On native the
          WorkspaceShell's ActivityRail replaces it. Still slides out in focus mode. */}
      {!isMobileLayout && !nativeCapable && (
        <div
          className={cn(
            "shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
            focusMode ? "w-0 opacity-0" : "w-auto opacity-100",
          )}
        >
          <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
        </div>
      )}

      {/* Mobile sidebar overlay — always mounted so open/close transitions play */}
      {isMobileLayout && (
        <>
          {/* Backdrop — fades in/out */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
              mobileSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            onClick={() => toggleMobileSidebar(false)}
          />
          {/* Sidebar panel — slides in/out via translateX */}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[min(16rem,80vw)] shadow-xl transition-transform duration-300 ease-out",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
            style={{ paddingTop: "var(--sat)", paddingBottom: "var(--sab)" }}
          >
            <Sidebar collapsed={false} onToggle={() => toggleMobileSidebar(false)} />
          </div>
        </>
      )}

      {/* Hover-to-reveal sidebar edge in focus mode */}
      {focusMode && !isMobileLayout && (
        <div
          className="fixed left-0 top-0 bottom-0 w-2 z-40 group"
          onMouseEnter={() => setFocusMode(false)}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-r bg-[var(--color-muted-foreground)] opacity-0 group-hover:opacity-40 transition-opacity" />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header — slides up in focus mode */}
        <div
          className={cn(
            "shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
            focusMode ? "h-0 opacity-0" : "h-auto opacity-100",
          )}
        >
          <Header
            isDark={isDark}
            onToggleDark={toggleDark}
            onOpenCommandPalette={handleOpenCommandPalette}
            onToggleSidebar={() => toggleMobileSidebar()}
            sidebarHidden={isMobileLayout}
          />
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main id="main-content" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Focus mode toggle button — top-right corner */}
            <button
              onClick={handleToggleFocusMode}
              title={focusMode ? "Exit Focus Mode (Esc)" : "Enter Focus Mode (⌘⇧F)"}
              className={cn(
                "absolute top-1 right-1 z-30 flex h-7 w-7 items-center justify-center rounded-md transition-all",
                "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
                focusMode ? "opacity-0 hover:opacity-100" : "opacity-60 hover:opacity-100",
              )}
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Native platforms: VS Code-style workspace shell. The shell stays
                mounted across all native routes so the TerminalDock (and its
                always-mounted TerminalPage) preserves PTY state. /settings and
                /notifications render via Outlet inside the shell. */}
            {nativeCapable ? (
              <WorkspaceShell registerHandle={registerShellHandle} />
            ) : (
              <div
                className={cn(
                  "relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-2 sm:p-4",
                  focusMode && "mx-auto w-full max-w-4xl",
                )}
              >
                <Suspense fallback={<PageLoading />}>
                  <Outlet />
                </Suspense>
              </div>
            )}
          </main>
        </div>

        {/* Footer — slides down in focus mode */}
        <div
          className={cn(
            "shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
            focusMode ? "h-0 opacity-0" : "h-auto opacity-100",
          )}
        >
          <footer className="flex flex-wrap items-center justify-between gap-y-0.5 border-t border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-[10px] text-[var(--color-muted-foreground)]">
            <span className="hidden sm:inline">
              Powered by Bemind Technology Co.,Ltd. (Bemindlabs)
            </span>
            <span className="sm:hidden">Bemindlabs</span>
            <div className="flex items-center gap-3">
              <span>LiteDuck v{appVersion}</span>
            </div>
          </footer>
        </div>
      </div>

      {/* Global overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onToggleDark={toggleDark}
        onToggleSidebar={() => {
          if (isMobileLayout) {
            setMobileSidebarOpen((v) => !v);
          } else if (nativeCapable) {
            shellHandleRef.current?.toggleSidePanel();
          } else {
            setSidebarCollapsed((v) => !v);
          }
        }}
        onToggleFocusMode={handleToggleFocusMode}
      />

      <ShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        bindings={bindings}
      />

      {/* Screen reader notification announcer (WCAG 4.1.3) */}
      <NotificationAnnouncer />
    </div>
  );
}

function NotificationAnnouncer() {
  const message = useNotificationAnnouncer();
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

// ── App (router root) ─────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f5f3f8] dark:bg-[#0f0b16] transition-opacity duration-500",
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
      onTransitionEnd={() => {
        if (fadeOut) onDone();
      }}
    >
      <img
        src="/liteduck.svg"
        alt="LiteDuck"
        className="h-20 w-20 animate-pulse"
        draggable={false}
      />
      <span className="mt-4 text-sm font-semibold tracking-widest text-[#0f0b16]/60 dark:text-white/60">
        LiteDuck
      </span>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Preload all secrets into backend cache once at launch so the macOS
  // Keychain password prompt only appears at startup, not mid-session.
  useEffect(() => {
    void import("@/lib/settings").then((m) => m.preloadSecrets().catch(() => undefined));
  }, []);

  return (
    <ErrorBoundary>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <DragGhost />
      <BiometricProvider>
        <BiometricLockScreen />
        <WorkspaceProvider>
          <BrowserRouter>
            <Routes>
              {/* Full-screen pages — no sidebar/header */}
              <Route
                path={ROUTES.WIZARD}
                element={
                  <Suspense fallback={<PageLoading />}>
                    <WizardPage />
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.LANDING}
                element={
                  <Suspense fallback={<PageLoading />}>
                    <LandingPage />
                  </Suspense>
                }
              />

              <Route
                path={ROUTES.HOME}
                element={
                  <WorkspaceGate>
                    <Layout />
                  </WorkspaceGate>
                }
              >
                {/* Default route — on native, just show the workspace shell at /.
                    On non-native (iOS/Android), fall through to /settings. */}
                <Route
                  index
                  element={
                    hasNativeCapabilities() ? null : <Navigate to={ROUTES.SETTINGS} replace />
                  }
                />

                {/* Native-only routes. The WorkspaceShell owns the actual UI for
                    terminal / files / git — these routes exist purely so the URL
                    can drive which side panel is active. Elements are null on
                    native so the shell's internal EditorArea/SidePanel renders. */}
                {hasNativeCapabilities() && (
                  <>
                    <Route path="terminal" element={null} />
                    <Route path="files" element={null} />
                    <Route path="git" element={null} />
                    <Route path="plugins" element={null} />
                  </>
                )}

                {/* Routes available on all platforms — these DO render via the
                    shell's Outlet on native (replacing the editor area). */}
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="settings" element={<SettingsPage />} />

                {/* Catch-all: fall back to the appropriate default */}
                <Route
                  path="*"
                  element={
                    <Navigate
                      to={hasNativeCapabilities() ? ROUTES.HOME : ROUTES.SETTINGS}
                      replace
                    />
                  }
                />
              </Route>
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </BiometricProvider>
    </ErrorBoundary>
  );
}
