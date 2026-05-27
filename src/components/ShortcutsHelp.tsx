import { useEffect, useRef } from "react";
import { X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BINDINGS,
  formatShortcut,
  type ShortcutBinding,
} from "@/hooks/useKeyboardShortcuts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  /** Pass resolved bindings if the user has customised them. */
  bindings?: ShortcutBinding[];
}

// ── Group label map ───────────────────────────────────────────────────────────

type Group = "Navigation" | "Terminal" | "General";

const ACTION_GROUP: Record<string, Group> = {
  "navigate-terminal": "Navigation",
  "navigate-files": "Navigation",
  "navigate-git": "Navigation",
  "navigate-settings": "Navigation",
  "terminal-new-tab": "Terminal",
  "terminal-close-tab": "Terminal",
  "open-command-palette": "General",
  "open-shortcuts-help": "General",
};

const GROUP_ORDER: Group[] = ["Navigation", "Terminal", "General"];

// ── ShortcutRow ───────────────────────────────────────────────────────────────

interface ShortcutRowProps {
  binding: ShortcutBinding;
}

function ShortcutRow({ binding }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[var(--color-foreground)] truncate">{binding.label}</span>
        {binding.description && binding.description !== binding.label && (
          <p className="text-xs text-[var(--color-muted-foreground)] truncate">
            {binding.description}
          </p>
        )}
      </div>
      <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-muted-foreground)] whitespace-nowrap">
        {formatShortcut(binding)}
      </kbd>
    </div>
  );
}

// ── ShortcutsHelp ─────────────────────────────────────────────────────────────

export function ShortcutsHelp({ open, onClose, bindings = DEFAULT_BINDINGS }: ShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the element that had focus before the dialog opened so we can
  // restore focus when it closes (WCAG 2.1 SC 2.4.3 Focus Order).
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Focus the panel when it opens; restore focus when it closes.
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => panelRef.current?.focus());
    } else {
      // Restore focus to the element that triggered the dialog.
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  // Group bindings — deduplicate by label within a group so "Command Palette"
  // only appears once even though it has two bindings.
  const grouped = new Map<Group, ShortcutBinding[]>();
  for (const group of GROUP_ORDER) {
    grouped.set(group, []);
  }

  const seenLabels = new Set<string>();
  for (const binding of bindings) {
    const group = ACTION_GROUP[binding.action] ?? "General";
    const key = `${group}:${binding.label}`;
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    grouped.get(group)?.push(binding);
  }

  return (
    // Backdrop
    <div
      role="presentation"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        className={cn(
          "flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--color-border)]",
          "shadow-2xl outline-none",
          "animate-in fade-in zoom-in-95 duration-150",
        )}
        style={{ backgroundColor: "var(--color-popover)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Keyboard className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--color-foreground)]">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            aria-label="Close shortcuts help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-5">
          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {group}
                </h3>
                <div className="divide-y divide-[var(--color-border)]">
                  {items.map((binding) => (
                    <ShortcutRow key={`${binding.action}-${binding.key}`} binding={binding} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-2">
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Shortcuts can be customised in{" "}
            <span className="font-medium text-[var(--color-foreground)]">
              Settings &rsaquo; Keyboard Shortcuts
            </span>
            . Press{" "}
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            to close.
          </p>
        </div>
      </div>
    </div>
  );
}
