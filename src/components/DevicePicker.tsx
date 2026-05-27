import { useState, useEffect, useRef } from "react";
import { Monitor, Smartphone, Tablet, RotateCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DevicePreset, ViewportMode } from "@/lib/device-presets";
import { presetsForMode, defaultPresetForMode } from "@/lib/device-presets";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP = {
  Monitor,
  Smartphone,
  Tablet,
} as const;

const MODE_ORDER: ViewportMode[] = ["desktop", "mobile", "tablet"];

// ---------------------------------------------------------------------------
// DevicePicker
// ---------------------------------------------------------------------------

interface DevicePickerProps {
  activePreset: DevicePreset;
  onPresetChange: (preset: DevicePreset) => void;
  onRotate: () => void;
}

export function DevicePicker({ activePreset, onPresetChange, onRotate }: DevicePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const btnCls = cn(
    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
    "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
  );

  return (
    <div ref={ref} className="relative flex items-center">
      {/* Mode toggle buttons */}
      {MODE_ORDER.map((mode) => {
        const Icon =
          ICON_MAP[mode === "desktop" ? "Monitor" : mode === "mobile" ? "Smartphone" : "Tablet"];
        const isActive = activePreset.mode === mode;
        return (
          <button
            key={mode}
            onClick={() => {
              if (isActive) {
                setOpen((v) => !v);
              } else {
                onPresetChange(defaultPresetForMode(mode));
                setOpen(false);
              }
            }}
            className={cn(
              btnCls,
              isActive && "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
            )}
            aria-label={`${mode} view`}
            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}

      {/* Rotate (only for non-desktop) */}
      {activePreset.mode !== "desktop" && (
        <button onClick={onRotate} className={btnCls} aria-label="Rotate viewport" title="Rotate">
          <RotateCw className="h-3 w-3" />
        </button>
      )}

      {/* Dropdown */}
      {open && activePreset.mode !== "desktop" && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-popover)] p-1 shadow-lg">
          {presetsForMode(activePreset.mode).map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onPresetChange(preset);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                "hover:bg-[var(--color-accent)]",
                preset.id === activePreset.id && "bg-[var(--color-accent)]",
              )}
            >
              <Check
                className={cn(
                  "h-3 w-3 shrink-0",
                  preset.id === activePreset.id ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="flex-1 font-medium">{preset.label}</span>
              <span className="text-[var(--color-muted-foreground)]">
                {preset.width}&times;{preset.height}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
