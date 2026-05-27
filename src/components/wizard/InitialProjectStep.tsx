import { useState } from "react";
import { FolderOpen, FolderPlus, Layout, AlertCircle, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { workspaceScaffold } from "@/lib/workspace";
import type { WizardStepProps } from "@/components/wizard/WorkspaceStep";

// ── Types ─────────────────────────────────────────────────────────────────────

type InitMode = "scratch" | "template" | "existing";

type ScaffoldTemplate = "git-init" | "react-vite" | "node" | "python" | "rust";

interface TemplateOption {
  value: ScaffoldTemplate;
  label: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: "react-vite", label: "React (Vite)" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
];

const MODES: {
  value: InitMode;
  icon: typeof FolderPlus;
  title: string;
  description: string;
}[] = [
  {
    value: "scratch",
    icon: FolderPlus,
    title: "Start from scratch",
    description: "Initialize an empty project with Git.",
  },
  {
    value: "template",
    icon: Layout,
    title: "Use a template",
    description: "Scaffold from a project template.",
  },
  {
    value: "existing",
    icon: FolderOpen,
    title: "Import existing",
    description: "This workspace already has files. Skip scaffolding.",
  },
];

// ── InitialProjectStep ────────────────────────────────────────────────────────

export function InitialProjectStep({ onNext }: WizardStepProps) {
  const { workspace } = useWorkspace();
  const [selected, setSelected] = useState<InitMode>("scratch");
  const [scaffoldTemplate, setScaffoldTemplate] = useState<ScaffoldTemplate>("react-vite");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveTemplate(): ScaffoldTemplate {
    return selected === "scratch" ? "git-init" : scaffoldTemplate;
  }

  async function handleContinue() {
    setError(null);

    if (selected === "existing") {
      onNext();
      return;
    }

    if (!workspace) {
      setError("No workspace directory set. Please complete the Workspace step first.");
      return;
    }

    setLoading(true);
    try {
      await workspaceScaffold(workspace, resolveTemplate());
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = loading
    ? "Initializing..."
    : selected === "existing"
      ? "Skip & Continue"
      : "Initialize & Continue";

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
          Project Initialization
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Choose how to set up your project. You can always add more tooling later.
        </p>
      </div>

      {/* Mode cards */}
      <div className="flex flex-col gap-3">
        {MODES.map(({ value, icon: Icon, title, description }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSelected(value);
              setError(null);
            }}
            className={cn(
              "flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
              selected === value
                ? "border-[var(--color-sidebar-primary)] bg-[var(--color-sidebar-primary)]/10"
                : "border-[var(--color-border)] bg-[var(--color-background)] hover:bg-[var(--color-accent)]",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
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

              {/* Template sub-select — only shown when "template" card is active */}
              {value === "template" && selected === "template" && (
                <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={scaffoldTemplate}
                    onChange={(e) => setScaffoldTemplate(e.target.value as ScaffoldTemplate)}
                    size="sm"
                  >
                    {TEMPLATE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 px-4 py-3 text-xs text-[var(--color-destructive)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden next-override button consumed by wizard footer */}
      <button
        id="wizard-next-override"
        data-label={buttonLabel}
        data-disabled={loading ? "true" : "false"}
        onClick={() => void handleContinue()}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      </button>
    </div>
  );
}
