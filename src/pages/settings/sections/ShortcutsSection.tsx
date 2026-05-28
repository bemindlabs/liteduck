import { useState } from "react";
import { Keyboard, RefreshCw, Save, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_BINDINGS,
  formatShortcut,
  loadShortcutOverrides,
  saveShortcutOverrides,
  resetShortcutOverrides,
  type ShortcutBinding,
  type ShortcutOverrides,
} from "@/hooks/useKeyboardShortcuts";

interface ShortcutRowEditorProps {
  binding: ShortcutBinding;
  override: Pick<ShortcutBinding, "key" | "mod" | "shift"> | undefined;
  onChange: (
    action: ShortcutBinding["action"],
    patch: { key: string; mod: boolean; shift: boolean },
  ) => void;
  conflict?: string | null;
}

function ShortcutRowEditor({ binding, override, onChange, conflict }: ShortcutRowEditorProps) {
  const current = override ?? {
    key: binding.key,
    mod: binding.mod,
    shift: binding.shift ?? false,
  };

  const isModified =
    override !== undefined &&
    (override.key !== binding.key ||
      override.mod !== binding.mod ||
      override.shift !== (binding.shift ?? false));

  function handleKeyCapture(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Meta" || e.key === "Control" || e.key === "Alt" || e.key === "Shift") {
      return;
    }
    e.preventDefault();
    onChange(binding.action, {
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
      mod: e.metaKey || e.ctrlKey,
      shift: e.shiftKey,
    });
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
            {binding.label}
            {isModified && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning bg-warning-subtle">
                modified
              </span>
            )}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)] truncate">
            {binding.description}
          </p>
        </div>

        <input
          type="text"
          readOnly
          value={formatShortcut({ ...binding, ...current })}
          onKeyDown={handleKeyCapture}
          placeholder="Press shortcut..."
          aria-invalid={conflict ? true : undefined}
          className={cn(
            "w-36 shrink-0 cursor-pointer rounded-md border bg-[var(--color-background)]",
            "px-2 py-1 text-center text-xs font-mono text-[var(--color-foreground)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
            "placeholder:text-[var(--color-muted-foreground)]",
            conflict ? "border-[var(--color-destructive)]" : "border-[var(--color-input)]",
          )}
          title="Click and press your desired shortcut key combination"
        />
      </div>
      {conflict && (
        <p
          className="mt-1 text-right text-xs text-[var(--color-destructive)]"
          role="alert"
        >
          Conflicts with: {conflict}
        </p>
      )}
    </div>
  );
}

interface ShortcutsSectionProps {
  onSaved: () => void;
}

export function ShortcutsSection({ onSaved }: ShortcutsSectionProps) {
  const [overrides, setOverrides] = useState<ShortcutOverrides>(() => loadShortcutOverrides());
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const primaryBindings = (() => {
    const seen = new Set<string>();
    return DEFAULT_BINDINGS.filter((b) => {
      if (seen.has(b.action)) return false;
      seen.add(b.action);
      return true;
    });
  })();

  // Detect duplicate key combos across bindings (effective = override ?? default).
  // Returns a map of action → human label of the *other* action it conflicts with.
  const conflicts: Record<string, string> = (() => {
    const combo = (b: { key: string; mod: boolean; shift?: boolean }) =>
      `${b.mod ? "M" : ""}${b.shift ? "S" : ""}-${b.key.toLowerCase()}`;
    const seen = new Map<string, ShortcutBinding>();
    const out: Record<string, string> = {};
    for (const binding of primaryBindings) {
      const ovr = overrides[binding.action];
      const effective = ovr
        ? { key: ovr.key, mod: ovr.mod, shift: ovr.shift ?? false }
        : { key: binding.key, mod: binding.mod, shift: binding.shift ?? false };
      const k = combo(effective);
      const prior = seen.get(k);
      if (prior) {
        out[binding.action] = prior.label;
        out[prior.action] = binding.label;
      } else {
        seen.set(k, binding);
      }
    }
    return out;
  })();

  function handleChange(
    action: ShortcutBinding["action"],
    patch: { key: string; mod: boolean; shift: boolean },
  ) {
    setOverrides((prev) => ({ ...prev, [action]: patch }));
  }

  function handleSave() {
    saveShortcutOverrides(overrides);
    setResetConfirmed(false);
    onSaved();
  }

  function handleReset() {
    resetShortcutOverrides();
    setOverrides({});
    setResetConfirmed(true);
  }

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <section
      id="section-shortcuts"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium text-[var(--color-foreground)]">
            <Keyboard className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            Keyboard Shortcuts
          </h3>
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
            Click a shortcut field and press your desired key combination to customise it. Changes
            take effect after saving and reloading the app.
          </p>
        </div>
        {hasOverrides && (
          <button
            type="button"
            onClick={handleReset}
            className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] transition-colors"
            title="Reset all shortcuts to defaults"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset all
          </button>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {primaryBindings.map((binding) => (
          <ShortcutRowEditor
            key={binding.action}
            binding={binding}
            override={overrides[binding.action]}
            onChange={handleChange}
            conflict={conflicts[binding.action] ?? null}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        {resetConfirmed ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Shortcuts reset to defaults.
          </p>
        ) : (
          <span />
        )}
        <Button onClick={handleSave} size="sm">
          <Save className="h-3.5 w-3.5" />
          Save Shortcuts
        </Button>
      </div>
    </section>
  );
}
