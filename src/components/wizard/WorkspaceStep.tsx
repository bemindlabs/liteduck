import { useState, useEffect, type RefObject } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSetting, saveSetting } from "@/lib/settings";
import { useFileDrop } from "@/hooks";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// ── WorkspaceStep ─────────────────────────────────────────────────────────────

export function WorkspaceStep({ onNext }: WizardStepProps) {
  const [selectedPath, setSelectedPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { ref: dropRef, isDragOver } = useFileDrop((p) => setSelectedPath(p));

  useEffect(() => {
    void getSetting("workspace_directory").then((v) => {
      if (v) setSelectedPath(v);
    });
  }, []);

  async function handleBrowse() {
    setError(null);
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select Workspace Directory",
    });
    if (!selected) return;
    setSelectedPath(selected);
  }

  async function handleSaveAndNext() {
    if (!selectedPath) {
      setError("Please select a workspace directory before continuing.");
      return;
    }
    setSaving(true);
    try {
      await saveSetting("workspace_directory", selectedPath);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-foreground)]">
          <FolderOpen className="h-5 w-5 text-[var(--color-sidebar-primary)]" />
          Workspace Directory
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Choose the root folder where LiteDuck will store your project files and workspace
          settings. Pick a folder that is already used as your coding workspace, or create a new
          one.
        </p>
      </div>

      {/* Picker area */}
      <div className="space-y-3">
        <Button
          variant="outline"
          onClick={() => void handleBrowse()}
          disabled={saving}
          className="w-full gap-2 justify-start font-normal"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-sidebar-primary)]" />
          Browse&hellip;
        </Button>

        {/* Selected path display / drop zone */}
        {selectedPath ? (
          <div
            ref={dropRef as RefObject<HTMLDivElement>}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-4 py-3",
              "border-[var(--color-border)] bg-[var(--color-accent)]",
              isDragOver && "ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]",
            )}
          >
            <FolderCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-sidebar-primary)]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--color-foreground)] mb-0.5">
                Selected workspace
              </p>
              <p className="break-all text-xs text-[var(--color-muted-foreground)] font-mono">
                {selectedPath}
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={dropRef as RefObject<HTMLDivElement>}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-4 py-3",
              "border-dashed border-[var(--color-border)] bg-[var(--color-background)]",
              isDragOver &&
                "ring-2 ring-[var(--color-primary)] border-[var(--color-primary)] bg-[var(--color-primary)]/5",
            )}
          >
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {isDragOver ? (
                "Drop folder here"
              ) : (
                <>
                  No directory selected yet. Click <strong>Browse</strong> or drop a folder.
                </>
              )}
            </p>
          </div>
        )}

        {/* Validation error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-destructive)]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)] px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-[var(--color-foreground)]">
          This is your project directory
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Your code and files live here. LiteDuck keeps its own settings, preferences, and templates
          globally in{" "}
          <code className="rounded bg-[var(--color-background)] px-1 py-0.5 text-[10px] font-mono">
            ~/.liteduck
          </code>
          {" — "}nothing is written into your project folder.
        </p>
      </div>

      {/* Hidden next-override button consumed by wizard footer */}
      <button
        id="wizard-next-override"
        data-label={saving ? "Saving..." : "Save & Continue"}
        data-disabled={saving || !selectedPath ? "true" : "false"}
        onClick={() => void handleSaveAndNext()}
        className="hidden"
        aria-hidden
      />
    </div>
  );
}
