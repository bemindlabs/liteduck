import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  ChevronDown,
  FolderPlus,
  ArrowRightLeft,
  Sun,
  Moon,
  Code,
  Users,
  Loader2,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/NotificationCenter";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { useWorkspace, MAX_RECENT_WORKSPACES } from "@/contexts/WorkspaceContext";
import { useAppMode } from "@/contexts/AppModeContext";
import type { AppMode } from "@/contexts/AppModeContext";
import { workspaceInit } from "@/lib/workspace";
import { truncatePath } from "@/lib/truncate-path";
import { hasNativeCapabilities } from "@/lib/platform";

// ── WorkspaceSwitcher ─────────────────────────────────────────────────────────

/**
 * Dropdown button in the header that shows the current workspace (truncated
 * path), lists up to 5 recent workspaces for one-click switching, and exposes
 * a Browse action that opens the native OS folder picker via Tauri dialog.
 */
export function WorkspaceSwitcher() {
  const { workspace, recentWorkspaces, setWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  // Recalculate portal position whenever the dropdown opens, clamped to viewport.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 260; // min-w-[260px]
    const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 8);
    setDropPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [open]);

  // Open the native OS folder picker directly — no intermediate modal.
  const handleBrowse = useCallback(async () => {
    setOpen(false);
    setBrowseError(null);
    setBrowsing(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Workspace Directory",
      });
      if (!selected) return;
      await workspaceInit(selected);
      await setWorkspace(selected);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrowsing(false);
    }
  }, [setWorkspace]);

  const displayLabel = workspace ? truncatePath(workspace) : "No workspace";

  // Deduplicate: filter out current workspace, then cap at MAX_RECENT_WORKSPACES.
  const recents = recentWorkspaces
    .filter((w) => w.path !== workspace)
    .slice(0, MAX_RECENT_WORKSPACES);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        disabled={browsing}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-[var(--color-border)]",
          "bg-[var(--color-muted)] px-2.5 py-1.5 text-xs text-[var(--color-muted-foreground)]",
          "transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
          "max-w-[200px] disabled:opacity-60",
        )}
        aria-label="Switch workspace"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {browsing ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {/* Error toast shown beneath the button */}
      {browseError && (
        <p className="absolute left-0 top-full mt-1 max-w-xs rounded-md border border-destructive bg-[var(--color-popover)] px-2 py-1 text-[10px] text-destructive shadow-md z-[9999]">
          {browseError}
        </p>
      )}

      {/* Click-catcher backdrop */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />,
          document.body,
        )}

      {/* Dropdown — portaled to body to escape any stacking context */}
      {open &&
        createPortal(
          <div
            role="listbox"
            aria-label="Workspace switcher"
            className={cn(
              "fixed z-[9999] min-w-[260px] max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--color-border)]",
              "shadow-2xl",
            )}
            style={{
              top: dropPos.top,
              left: dropPos.left,
              backgroundColor: "var(--color-popover)",
            }}
          >
            {/* Current workspace */}
            {workspace && (
              <div className="border-b border-[var(--color-border)] px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Current
                </p>
                <div
                  role="option"
                  aria-selected={true}
                  className={cn(
                    "mt-1 flex flex-col rounded-sm px-2 py-1.5",
                    "bg-[var(--color-accent)] cursor-default",
                  )}
                >
                  <span className="text-xs font-semibold text-[var(--color-foreground)]">
                    {truncatePath(workspace)}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)] truncate">
                    {workspace}
                  </span>
                </div>
              </div>
            )}

            {/* Recent workspaces */}
            {recents.length > 0 && (
              <div className="border-b border-[var(--color-border)] px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Recent
                </p>
                <ul className="mt-1 space-y-0.5">
                  {recents.map((w) => (
                    <li key={w.path}>
                      <button
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          setOpen(false);
                          void setWorkspace(w.path, w.remote);
                        }}
                        className={cn(
                          "w-full flex flex-col rounded-sm px-2 py-1.5 text-left",
                          "hover:bg-[var(--color-accent)] transition-colors",
                        )}
                      >
                        <span className="text-xs font-semibold text-[var(--color-foreground)]">
                          {truncatePath(w.path)}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted-foreground)] truncate">
                          {w.remote ? `${w.remote.username}@${w.remote.host}:${w.path}` : w.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="px-3 py-2 space-y-0.5">
              {hasNativeCapabilities() && (
                <button
                  onClick={() => void handleBrowse()}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                    "text-xs text-[var(--color-muted-foreground)]",
                    "hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors",
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  <span>Browse...</span>
                </button>
              )}

              {hasNativeCapabilities() && (
                <button
                  onClick={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                    "text-xs text-[var(--color-muted-foreground)]",
                    "hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors",
                  )}
                >
                  <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                  <span>Create New...</span>
                </button>
              )}

              <button
                onClick={() => {
                  setOpen(false);
                  void navigate(ROUTES.LANDING);
                }}
                className={cn(
                  "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                  "text-xs text-[var(--color-muted-foreground)]",
                  "hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors",
                )}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                <span>Change Workspace</span>
              </button>
            </div>
          </div>,
          document.body,
        )}

      <CreateWorkspaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ── ModeSwitcher ──────────────────────────────────────────────────────────────

const MODE_OPTIONS: {
  value: AppMode;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { value: "solo", icon: Code, label: "SOLO" },
  { value: "team", icon: Users, label: "TEAM" },
];

export function ModeSwitcher() {
  const { mode, setMode } = useAppMode();

  return (
    <div
      className={cn(
        "flex items-center rounded-md border border-[var(--color-border)]",
        "bg-[var(--color-muted)] p-0.5",
      )}
      role="radiogroup"
      aria-label="App mode"
    >
      {MODE_OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-all",
            mode === value
              ? "bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export interface HeaderProps {
  isDark: boolean;
  onToggleDark: () => void;
  onOpenCommandPalette: () => void;
  /** Show hamburger toggle on small screens when sidebar is hidden. */
  onToggleSidebar?: () => void;
  /** Whether the sidebar is currently hidden (mobile overlay mode). */
  sidebarHidden?: boolean;
}

export function Header({
  isDark,
  onToggleDark,
  onOpenCommandPalette,
  onToggleSidebar,
  sidebarHidden,
}: HeaderProps) {
  return (
    <header className="relative z-[100] grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)] px-2 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-self-start">
        {/* Hamburger toggle — visible only when sidebar is auto-hidden on small screens */}
        {sidebarHidden && onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
            className="shrink-0 min-h-[44px] min-w-[44px]"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <WorkspaceSwitcher />
        {/* Mode switcher — hidden on very small screens, always in command palette */}
        <div className="hidden sm:block">
          <ModeSwitcher />
        </div>
      </div>

      {/* Center — reserved */}
      <div className="flex items-center justify-self-center" />

      <div className="flex items-center gap-1 sm:gap-2 justify-self-end">
        {/* Command palette trigger — visible on md+ screens */}
        <button
          onClick={onOpenCommandPalette}
          className={cn(
            "hidden md:flex items-center gap-2 rounded-md border border-[var(--color-border)]",
            "bg-[var(--color-muted)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)]",
            "transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
          )}
          aria-label="Open command palette"
        >
          <span>Search commands</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1 py-0.5 text-[10px] font-mono">
            ⌘K
          </kbd>
        </button>

        <NotificationCenter />
        {/* Dark mode toggle — hidden on small screens, available via command palette */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleDark}
          aria-label="Toggle dark mode"
          className="hidden sm:inline-flex"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
