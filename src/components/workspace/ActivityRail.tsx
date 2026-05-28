/**
 * ActivityRail — narrow icon column on the far left of the workspace shell.
 *
 * Mirrors the VS Code "activity bar": one icon per side-panel kind. Clicking an
 * icon toggles the matching side panel; the currently-active icon is highlighted.
 *
 * Clicking the icon for the *active* panel collapses the panel (matches VS Code
 * behaviour). The shell decides what "active" means when nothing is selected.
 */

import { Bell, Boxes, FolderTree, GitBranch, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiteDuckLogo } from "@/components/LiteDuckLogo";
import type { WorkspacePanel } from "@/lib/routes";

interface RailItem {
  id: WorkspacePanel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOP_ITEMS: RailItem[] = [
  { id: "files", label: "Explorer (Files)", icon: FolderTree },
  { id: "git", label: "Source Control", icon: GitBranch },
  { id: "plugins", label: "Plugins", icon: Boxes },
];

const BOTTOM_ITEMS: RailItem[] = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
];

export interface ActivityRailProps {
  /** Currently-active panel, or null when the side panel is collapsed. */
  active: WorkspacePanel | null;
  /**
   * Called when the user clicks an activity icon.
   * If the icon matches `active`, the parent should collapse the panel;
   * otherwise it should switch to that panel (and uncollapse if needed).
   */
  onSelect: (panel: WorkspacePanel) => void;
}

export function ActivityRail({ active, onSelect }: ActivityRailProps) {
  return (
    <nav
      aria-label="Workspace activity"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] py-2"
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center">
        <LiteDuckLogo className="h-6 w-6" decorative />
      </div>

      <div className="flex flex-col gap-1">
        {TOP_ITEMS.map((item) => (
          <RailButton key={item.id} item={item} active={active} onSelect={onSelect} />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        {BOTTOM_ITEMS.map((item) => (
          <RailButton key={item.id} item={item} active={active} onSelect={onSelect} />
        ))}
      </div>
    </nav>
  );
}

function RailButton({
  item,
  active,
  onSelect,
}: {
  item: RailItem;
  active: WorkspacePanel | null;
  onSelect: (panel: WorkspacePanel) => void;
}) {
  const isActive = active === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={item.label}
      aria-label={item.label}
      aria-pressed={isActive}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        "text-[var(--color-muted-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-accent-foreground)]",
        isActive &&
          "bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)]",
      )}
    >
      <Icon className="h-4 w-4" />
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--color-primary)]"
        />
      )}
    </button>
  );
}
