/**
 * Application sidebar navigation.
 *
 * Extracted from App.tsx to reduce the main layout file's complexity.
 * Groups are filtered by native capability detection (hides desktop-only
 * routes on mobile platforms).
 */

import { NavLink } from "react-router-dom";
import {
  Terminal,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, NATIVE_ONLY_ROUTES } from "@/lib/routes";
import { hasNativeCapabilities } from "@/lib/platform";
import { LiteDuckLogo } from "@/components/LiteDuckLogo";

// ── Nav items config ──────────────────────────────────────────────────────────

const NAV_GROUPS: {
  title: string;
  items: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
}[] = [
  {
    title: "Dev Mode",
    items: [{ to: ROUTES.TERMINAL, icon: Terminal, label: "Terminal" }],
  },
  {
    title: "Source Control",
    items: [
      { to: ROUTES.GIT, icon: GitBranch, label: "Git" },
      { to: ROUTES.FILES, icon: FolderTree, label: "Files" },
    ],
  },
];

const BOTTOM_NAV_ITEMS = [
  { to: ROUTES.NOTIFICATIONS, icon: Bell, label: "Notifications" },
  { to: ROUTES.SETTINGS, icon: Settings, label: "Settings" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const nativeCapable = hasNativeCapabilities();

  const filteredGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: nativeCapable ? g.items : g.items.filter((item) => !NATIVE_ONLY_ROUTES.has(item.to)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] transition-all duration-300 ease-in-out",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-[var(--color-sidebar-border)] px-3",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <LiteDuckLogo className="h-7 w-7 shrink-0" decorative />
        {!collapsed && (
          <span className="text-sm font-bold tracking-wider text-[var(--color-sidebar-foreground)]">
            LiteDuck
          </span>
        )}
      </div>

      {/* Primary nav */}
      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col min-h-0 overflow-y-auto p-2"
      >
        {filteredGroups.map(({ title, items }, gi) => (
          <div key={title}>
            {gi > 0 && <hr className="my-2 border-[var(--color-sidebar-border)]" />}
            {!collapsed && (
              <span className="mb-1 block px-2.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]/60">
                {title}
              </span>
            )}
            <div className="flex flex-col gap-1">
              {items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      "text-[var(--color-muted-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-accent-foreground)]",
                      isActive &&
                        "bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)]",
                      collapsed && "justify-center px-2",
                    )
                  }
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-1 border-t border-[var(--color-sidebar-border)] p-2 safe-area-bottom">
        {BOTTOM_NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                "text-[var(--color-muted-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-accent-foreground)]",
                isActive &&
                  "bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)]",
                collapsed && "justify-center px-2",
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] text-[var(--color-muted-foreground)] shadow-sm transition-colors hover:text-[var(--color-sidebar-foreground)]"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
