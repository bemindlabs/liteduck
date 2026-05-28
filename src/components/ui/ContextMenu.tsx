/**
 * ContextMenu — a small reusable right-click menu primitive.
 *
 * Extracted from the original FileTree implementation so the file tree, the
 * terminal panes, and the editor area can all share one well-behaved menu:
 *
 *   - opens at the cursor and clamps into the viewport
 *   - dismisses on outside-click, Escape, scroll, window blur, and resize
 *   - exposes `role="menu"` / `role="menuitem"` for assistive tech
 *   - supports separators, destructive styling, and disabled items
 *   - uses the dark-theme design tokens (`--color-popover` etc.)
 *
 * Callers describe the menu declaratively via `items`; each item's `onSelect`
 * runs and the menu closes automatically (unless the item opts out via
 * `keepOpen`, used by the file tree's two-step delete confirmation).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  /** Stable key + visible label. */
  label: string;
  /** Invoked on click. Return value is ignored. */
  onSelect: () => void | Promise<void>;
  /** When false the row is omitted entirely. Defaults to true. */
  show?: boolean;
  /** Greys the row and blocks the click without closing the menu. */
  disabled?: boolean;
  /** Renders with destructive (red) tokens. */
  destructive?: boolean;
  /** Draw a separator line above this item. */
  separatorBefore?: boolean;
  /** Keep the menu open after selecting (e.g. multi-step confirmations). */
  keepOpen?: boolean;
}

export interface ContextMenuProps {
  /** Cursor x in viewport (clientX). */
  x: number;
  /** Cursor y in viewport (clientY). */
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Accessible label for the menu container. */
  ariaLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContextMenu({ x, y, items, onClose, ariaLabel }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Start at the cursor; clamp into the viewport once we can measure the menu.
  const [pos, setPos] = useState({ left: x, top: y });

  // Re-clamp whenever the requested position changes (new right-click) or the
  // item set changes (which can resize the menu).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    setPos({
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
    });
  }, [x, y, items]);

  // Dismiss on outside-click, Escape, scroll, window blur, and resize —
  // standard desktop context-menu behaviour.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Capture-phase scroll so nested scroll containers also dismiss the menu.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Move keyboard focus into the menu so Escape works and a subsequent click
  // anywhere else dismisses it.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const visible = items.filter((item) => item.show !== false);
  if (visible.length === 0) return null;

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={ariaLabel}
      className="fixed z-50 min-w-[160px] rounded-md border border-[var(--color-border)] py-1 shadow-lg outline-none"
      style={{ left: pos.left, top: pos.top, backgroundColor: "var(--color-popover)" }}
    >
      {visible.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && <div className="my-1 border-t border-[var(--color-border)]" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            aria-disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              void item.onSelect();
              if (!item.keepOpen) onClose();
            }}
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm transition-colors",
              item.disabled
                ? "cursor-default text-[var(--color-muted-foreground)] opacity-50"
                : item.destructive
                  ? "text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  : "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
