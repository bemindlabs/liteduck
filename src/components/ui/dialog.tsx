import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ── DialogBackdrop ───────────────────────────────────────────────────────────

export interface DialogBackdropProps {
  /** Close handler when clicking the backdrop. */
  onClose?: () => void;
  /** Align panel to top (e.g. command palette) instead of center. */
  align?: "center" | "top";
  /** Extra classes on the backdrop. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Full-screen backdrop that centers (or top-aligns) dialog content.
 * Clicking outside the panel triggers `onClose`.
 */
export function DialogBackdrop({
  onClose,
  align = "center",
  className,
  children,
}: DialogBackdropProps) {
  return (
    <div
      role="presentation"
      className={cn(
        "fixed inset-0 z-[10000] flex justify-center bg-black/60 backdrop-blur-sm",
        align === "top" ? "items-start pt-[12vh]" : "items-center",
        className,
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}

// ── DialogPanel ──────────────────────────────────────────────────────────────

export interface DialogPanelProps {
  /** Accessible label for the dialog. */
  "aria-label": string;
  /** Max-width utility class, e.g. "max-w-md", "max-w-lg". */
  size?: string;
  /** Extra classes on the panel. */
  className?: string;
  children: React.ReactNode;
}

/**
 * The visible dialog card. Stops click propagation so backdrop dismiss works.
 */
export function DialogPanel({
  "aria-label": ariaLabel,
  size = "max-w-md",
  className,
  children,
}: DialogPanelProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn("w-full rounded-xl border border-[var(--color-border)]", size, className)}
      style={{ backgroundColor: "var(--color-popover)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// ── Dialog (composed) ────────────────────────────────────────────────────────

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible label for the dialog. */
  "aria-label": string;
  /** Max-width utility class. */
  size?: string;
  /** Align panel position. */
  align?: "center" | "top";
  /** Extra classes on the backdrop. */
  backdropClassName?: string;
  /** Extra classes on the panel. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Complete dialog: backdrop + panel + Escape-to-close + focus trap.
 */
export function Dialog({
  open,
  onClose,
  "aria-label": ariaLabel,
  size,
  align,
  backdropClassName,
  className,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
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

  // Focus the panel when it opens.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <DialogBackdrop onClose={onClose} align={align} className={backdropClassName}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "w-full rounded-xl border border-[var(--color-border)] outline-none mx-3 sm:mx-0",
          "shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150",
          size ?? "max-w-md",
          className,
        )}
        style={{ backgroundColor: "var(--color-popover)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DialogBackdrop>
  );
}
