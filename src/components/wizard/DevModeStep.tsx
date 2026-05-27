import { useState, useEffect } from "react";
import { Code, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSetting, saveSetting } from "@/lib/settings";
import type { WizardStepProps } from "@/components/wizard/WorkspaceStep";

// ── Options ───────────────────────────────────────────────────────────────────

const MODES = [
  {
    value: "solo",
    icon: Code,
    title: "Solo",
    description:
      "Work independently with AI assistants. Full development tools, terminal, and coding workflow.",
  },
  {
    value: "team",
    icon: Users,
    title: "Team",
    description:
      "Collaborate with agents and team members. Includes team chat, agents council, and shared memory.",
  },
] as const;

type DevMode = (typeof MODES)[number]["value"];

// ── DevModeStep ───────────────────────────────────────────────────────────────

export function DevModeStep({ onNext }: WizardStepProps) {
  const [selected, setSelected] = useState<DevMode>("solo");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSetting("dev_mode").then((v) => {
      if (v === "solo" || v === "team") setSelected(v);
    });
  }, []);

  async function handleSaveAndNext() {
    setSaving(true);
    try {
      await saveSetting("dev_mode", selected);
      onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-[var(--color-foreground)]">Development Mode</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Choose how you want to work. You can change this later in Settings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MODES.map(({ value, icon: Icon, title, description }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSelected(value)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              selected === value
                ? "border-[var(--color-sidebar-primary)] bg-[var(--color-sidebar-primary)]/10"
                : "border-[var(--color-border)] bg-[var(--color-background)] hover:bg-[var(--color-accent)]",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                selected === value
                  ? "text-[var(--color-sidebar-primary)]"
                  : "text-[var(--color-muted-foreground)]",
              )}
            />
            <div className="space-y-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  selected === value
                    ? "text-[var(--color-sidebar-primary)]"
                    : "text-[var(--color-foreground)]",
                )}
              >
                {title}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Hidden next-override button consumed by wizard footer */}
      <button
        id="wizard-next-override"
        data-label={saving ? "Saving..." : "Save & Continue"}
        data-disabled={saving ? "true" : "false"}
        onClick={() => void handleSaveAndNext()}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
