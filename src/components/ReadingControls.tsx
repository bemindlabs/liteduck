import { Minus, Plus, ALargeSmall, MoveHorizontal, WrapText } from "lucide-react";
import type { ReadingSettings } from "@/hooks/useReadingSettings";

export type { ReadingSettings } from "@/hooks/useReadingSettings";

interface ReadingControlsProps {
  settings: ReadingSettings;
  onUpdate: (partial: Partial<ReadingSettings>) => void;
  onReset: () => void;
}

function StepButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] transition-colors"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function ReadingControls({ settings, onUpdate, onReset }: ReadingControlsProps) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5">
      {/* Font size */}
      <div className="flex items-center gap-1" title="Font size">
        <ALargeSmall className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
        <StepButton
          onClick={() => onUpdate({ fontSize: Math.max(12, settings.fontSize - 1) })}
          label="Decrease font size"
        >
          <Minus className="h-3 w-3" />
        </StepButton>
        <span className="min-w-[28px] text-center text-[10px] font-mono text-[var(--color-muted-foreground)]">
          {settings.fontSize}
        </span>
        <StepButton
          onClick={() => onUpdate({ fontSize: Math.min(28, settings.fontSize + 1) })}
          label="Increase font size"
        >
          <Plus className="h-3 w-3" />
        </StepButton>
      </div>

      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Line height */}
      <div className="flex items-center gap-1" title="Line height">
        <WrapText className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
        <StepButton
          onClick={() =>
            onUpdate({ lineHeight: Math.max(1.2, +(settings.lineHeight - 0.1).toFixed(1)) })
          }
          label="Decrease line height"
        >
          <Minus className="h-3 w-3" />
        </StepButton>
        <span className="min-w-[28px] text-center text-[10px] font-mono text-[var(--color-muted-foreground)]">
          {settings.lineHeight.toFixed(1)}
        </span>
        <StepButton
          onClick={() =>
            onUpdate({ lineHeight: Math.min(3.0, +(settings.lineHeight + 0.1).toFixed(1)) })
          }
          label="Increase line height"
        >
          <Plus className="h-3 w-3" />
        </StepButton>
      </div>

      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Max width */}
      <div className="flex items-center gap-1" title="Content width">
        <MoveHorizontal className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
        <StepButton
          onClick={() => onUpdate({ maxWidth: Math.max(480, settings.maxWidth - 60) })}
          label="Narrower"
        >
          <Minus className="h-3 w-3" />
        </StepButton>
        <span className="min-w-[32px] text-center text-[10px] font-mono text-[var(--color-muted-foreground)]">
          {settings.maxWidth}
        </span>
        <StepButton
          onClick={() => onUpdate({ maxWidth: Math.min(1200, settings.maxWidth + 60) })}
          label="Wider"
        >
          <Plus className="h-3 w-3" />
        </StepButton>
      </div>

      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Reset */}
      <button
        type="button"
        onClick={onReset}
        className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      >
        Reset
      </button>
    </div>
  );
}
