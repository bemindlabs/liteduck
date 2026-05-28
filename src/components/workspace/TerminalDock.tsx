/**
 * TerminalDock — collapsible bottom dock that hosts TerminalPage.
 *
 * `TerminalPage` is *always mounted* so PTY sessions survive across panel
 * toggles (the same invariant the old Layout maintained). Collapsing the dock
 * simply hides it via CSS — no unmount.
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import TerminalPage from "@/pages/TerminalPage";

interface TerminalDockProps {
  /** When false, the dock is collapsed and only the header bar is shown. */
  open: boolean;
  onToggle: () => void;
}

export function TerminalDock({ open, onToggle }: TerminalDockProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-background)] transition-[height] duration-200 ease-in-out",
      )}
      style={{ height: open ? "35%" : "28px", minHeight: open ? 180 : 28 }}
    >
      {/* Header / handle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-7 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 text-xs",
          "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors",
        )}
        aria-expanded={open}
        aria-controls="workspace-terminal-dock"
        title={open ? "Collapse terminal (⌘`)" : "Show terminal (⌘`)"}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        <span className="font-medium uppercase tracking-wider text-[10px]">Terminal</span>
        <span className="ml-auto text-[10px] opacity-60">⌘`</span>
      </button>

      {/* Body — TerminalPage is always mounted; we hide it when collapsed. */}
      <div
        id="workspace-terminal-dock"
        className={cn("flex-1 min-h-0 overflow-hidden", !open && "invisible")}
        aria-hidden={!open}
      >
        <TerminalPage />
      </div>
    </div>
  );
}
