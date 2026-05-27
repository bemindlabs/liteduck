import { X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

// ── Modal ────────────────────────────────────────────────────────────────────

export interface ModalProps {
  /** When false (or omitted) the caller should simply not render this component. */
  open?: boolean;
  title: string;
  onClose: () => void;
  /**
   * Tailwind max-width class applied to the dialog panel.
   * Defaults to "max-w-md".
   */
  size?: string;
  children: React.ReactNode;
}

/**
 * General-purpose modal dialog with a title bar and close button.
 *
 * The `open` prop is optional – if omitted the modal renders unconditionally
 * (matching the pattern used in pages that conditionally mount the component).
 * When `open` is supplied and `false` the modal is hidden.
 */
export function Modal({ open = true, title, onClose, size = "max-w-md", children }: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} aria-label={title} size={size}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--color-foreground)]">{title}</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Body */}
      <div className="px-5 py-5">{children}</div>
    </Dialog>
  );
}
