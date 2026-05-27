import { useCallback, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { workspaceInit, pathExists } from "@/lib/workspace";
import { gitInit } from "@/lib/git";
import { truncatePath } from "@/lib/truncate-path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateWorkspaceDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
  /** Called after the workspace has been created and set. */
  onCreated?: (path: string) => void;
}

type UiStep = 1 | 2;
type CreationStep = "configure" | "creating" | "done";

interface StepTwoOptions {
  initGit: boolean;
  addGitignore: boolean;
  gitignoreTemplate: string;
  initDevCanvas: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GITIGNORE_TEMPLATES = [
  { value: "none", label: "None (minimal)" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
] as const;

const GITIGNORE_CONTENTS: Record<string, string> = {
  none: ".DS_Store\nThumbs.db\n",
  node: "node_modules/\ndist/\n.env\n.env.local\n*.log\n.DS_Store\nThumbs.db\n",
  python: "__pycache__/\n*.py[cod]\n*.egg-info/\ndist/\n.venv/\n.env\n*.log\n.DS_Store\n",
  rust: "target/\n*.log\n.DS_Store\nThumbs.db\n",
  go: "bin/\n*.exe\n*.log\n.DS_Store\nThumbs.db\n",
  java: "target/\n*.class\n*.jar\n*.log\n.DS_Store\nThumbs.db\n",
};

const DEFAULT_TWO: StepTwoOptions = {
  initGit: true,
  addGitignore: true,
  gitignoreTemplate: "none",
  initDevCanvas: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Join a parent dir and project name into a full path. */
function joinPath(parent: string, name: string): string {
  const sep = parent.includes("/") ? "/" : "\\";
  return parent.replace(/[/\\]+$/, "") + sep + name.trim();
}

/** Strip characters that are invalid in directory names. */
function sanitiseName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trimStart();
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ current }: { current: UiStep }) {
  return (
    <div className="flex items-center gap-1.5 mb-4" aria-hidden="true">
      {([1, 2] as UiStep[]).map((n) => (
        <div
          key={n}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            n === current
              ? "w-6 bg-[var(--color-sidebar-primary)]"
              : n < current
                ? "w-1.5 bg-[var(--color-sidebar-primary)]"
                : "w-1.5 bg-[var(--color-border)]",
          )}
        />
      ))}
    </div>
  );
}

// ── CheckboxRow ───────────────────────────────────────────────────────────────

interface CheckboxRowProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function CheckboxRow({
  id,
  label,
  description,
  icon,
  checked,
  onChange,
  disabled = false,
}: CheckboxRowProps) {
  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          "flex items-start gap-3 rounded-md border border-[var(--color-border)] px-3 py-2.5 cursor-pointer",
          "hover:bg-[var(--color-accent)] transition-colors",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          checked && !disabled && "border-[var(--color-sidebar-primary)] bg-[var(--color-sidebar)]",
        )}
      >
        {/* Custom checkbox */}
        <div className="mt-0.5 shrink-0">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="sr-only"
          />
          <div
            className={cn(
              "h-4 w-4 rounded border transition-colors flex items-center justify-center",
              checked && !disabled
                ? "border-[var(--color-sidebar-primary)] bg-[var(--color-sidebar-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-background)]",
            )}
            aria-hidden="true"
          >
            {checked && (
              <svg
                viewBox="0 0 10 8"
                fill="none"
                className="h-2.5 w-2.5 text-[var(--color-primary-foreground)]"
              >
                <path
                  d="M1 4l2.5 2.5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Icon + text */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-foreground)] leading-tight">
              {label}
            </p>
            <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5 leading-tight">
              {description}
            </p>
          </div>
        </div>
      </label>
    </li>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateWorkspaceDialog({ open, onClose, onCreated }: CreateWorkspaceDialogProps) {
  const { setWorkspace } = useWorkspace();

  // Stable IDs for form elements
  const parentId = useId();
  const nameId = useId();
  const gitignoreTplId = useId();

  // Wizard position
  const [uiStep, setUiStep] = useState<UiStep>(1);
  const [creationStep, setCreationStep] = useState<CreationStep>("configure");

  // Form values
  const [one, setOne] = useState({ parentDir: "", projectName: "" });
  const [two, setTwo] = useState(DEFAULT_TWO);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setUiStep(1);
    setCreationStep("configure");
    setOne({ parentDir: "", projectName: "" });
    setTwo(DEFAULT_TWO);
    setError(null);
    setCreatedPath(null);
  }, []);

  const handleClose = useCallback(() => {
    if (creationStep === "creating") return; // guard against accidental dismiss
    reset();
    onClose();
  }, [creationStep, onClose, reset]);

  // ── Step 1 ────────────────────────────────────────────────────────────────

  const handleBrowseParent = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Parent Directory",
      });
      if (selected) {
        setOne((prev) => ({ ...prev, parentDir: selected }));
        setError(null);
      }
    } catch {
      // user cancelled — no-op
    }
  }, []);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOne((prev) => ({ ...prev, projectName: sanitiseName(e.target.value) }));
    setError(null);
  }, []);

  const handleNextStep = useCallback(() => {
    if (!one.parentDir) {
      setError("Please select a parent directory.");
      return;
    }
    if (!one.projectName.trim()) {
      setError("Project name cannot be empty.");
      return;
    }
    setError(null);
    setUiStep(2);
  }, [one]);

  // ── Step 2 ────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    setError(null);
    setUiStep(1);
  }, []);

  const toggleTwo = useCallback((key: keyof StepTwoOptions) => {
    setTwo((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    const fullPath = joinPath(one.parentDir, one.projectName);
    setCreationStep("creating");
    setError(null);

    try {
      // Guard: don't clobber an existing directory
      const exists = await pathExists(fullPath);
      if (exists) {
        setCreationStep("configure");
        setUiStep(1);
        setError("A directory with this name already exists at the selected location.");
        return;
      }

      if (two.initDevCanvas) {
        // workspace_init creates the workspace directory and copies any bundled templates
        await workspaceInit(fullPath);
      }
      // Note: if the user opts out of LiteDuck init, the directory is not
      // created here — they will need to create it manually. A warning is shown
      // on the options step when this checkbox is unchecked.

      if (two.initGit) {
        await gitInit(fullPath);

        if (two.addGitignore && two.gitignoreTemplate) {
          const content = GITIGNORE_CONTENTS[two.gitignoreTemplate];
          if (content) {
            await invoke("files_write_text", {
              path: `${fullPath}/.gitignore`,
              contents: content,
            });
          }
        }
      }

      await setWorkspace(fullPath);
      setCreatedPath(fullPath);
      setCreationStep("done");
    } catch (err) {
      setCreationStep("configure");
      setError(`Failed to create workspace: ${String(err)}`);
    }
  }, [one, two, setWorkspace]);

  const handleOpen = useCallback(() => {
    if (!createdPath) return;
    onCreated?.(createdPath);
    handleClose();
  }, [createdPath, onCreated, handleClose]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const fullPath =
    one.parentDir && one.projectName.trim()
      ? joinPath(one.parentDir, one.projectName.trim())
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={handleClose} aria-label="Create new workspace" size="max-w-lg">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <FolderPlus className="h-5 w-5 text-[var(--color-sidebar-primary)]" />
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            Create Workspace
          </h2>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
          Set up a new project folder with LiteDuck scaffolding.
        </p>

        {/* Step indicator — only visible during the configure phase */}
        {creationStep === "configure" && <StepDots current={uiStep} />}

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive bg-destructive-subtle">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── UI Step 1: Location + name ─────────────────────────────────── */}
        {creationStep === "configure" && uiStep === 1 && (
          <>
            {/* Parent directory picker */}
            <div className="mb-4">
              <label
                htmlFor={parentId}
                className="block text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1"
              >
                Parent directory
              </label>

              <button
                id={parentId}
                type="button"
                onClick={handleBrowseParent}
                className={cn(
                  "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  "border-[var(--color-border)] bg-[var(--color-background)]",
                  "hover:bg-[var(--color-accent)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                  one.parentDir
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="truncate">
                  {one.parentDir ? truncatePath(one.parentDir) : "Browse for directory..."}
                </span>
              </button>

              {one.parentDir && (
                <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)] truncate">
                  {one.parentDir}
                </p>
              )}
            </div>

            {/* Project name */}
            <div className="mb-5">
              <label
                htmlFor={nameId}
                className="block text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1"
              >
                Project name
              </label>
              <input
                id={nameId}
                type="text"
                value={one.projectName}
                onChange={handleNameChange}
                placeholder="my-project"
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNextStep();
                }}
                className={cn(
                  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)]",
                  "px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
                )}
              />
              <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                Allowed: letters, numbers, hyphens, underscores, dots
              </p>
            </div>

            {/* Full path preview */}
            {fullPath && (
              <div className="mb-4 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2">
                <p className="text-[10px] text-[var(--color-muted-foreground)] mb-0.5">
                  Will be created at
                </p>
                <p className="text-xs text-[var(--color-foreground)] font-mono break-all">
                  {fullPath}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleNextStep}>
                Next
              </Button>
            </div>
          </>
        )}

        {/* ── UI Step 2: Options ─────────────────────────────────────────── */}
        {creationStep === "configure" && uiStep === 2 && (
          <>
            {/* Summary card */}
            <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                {one.projectName}
              </p>
              {fullPath && (
                <p className="text-[10px] text-[var(--color-muted-foreground)] truncate mt-0.5">
                  {fullPath}
                </p>
              )}
            </div>

            {/* Checkbox options */}
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              Initialization options
            </p>

            <ul className="space-y-2 mb-3">
              <CheckboxRow
                id="opt-liteduck"
                label="Initialize LiteDuck scaffolding"
                description="Creates the project directory and copies any bundled templates"
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                checked={two.initDevCanvas}
                onChange={() => toggleTwo("initDevCanvas")}
              />
              <CheckboxRow
                id="opt-git"
                label="Initialize git repository"
                description="Run git init in the new directory"
                icon={<GitBranch className="h-3.5 w-3.5" />}
                checked={two.initGit}
                onChange={() => toggleTwo("initGit")}
              />
              <CheckboxRow
                id="opt-gitignore"
                label="Add .gitignore template"
                description="Adds a standard .gitignore for common build artifacts"
                icon={<FileText className="h-3.5 w-3.5" />}
                checked={two.addGitignore}
                onChange={() => toggleTwo("addGitignore")}
                disabled={!two.initGit}
              />
            </ul>

            {/* .gitignore template selector */}
            {two.initGit && two.addGitignore && (
              <div className="mb-4 pl-3">
                <label
                  htmlFor={gitignoreTplId}
                  className="block text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1"
                >
                  Template
                </label>
                <Select
                  size="sm"
                  id={gitignoreTplId}
                  value={two.gitignoreTemplate}
                  onChange={(e) =>
                    setTwo((prev) => ({
                      ...prev,
                      gitignoreTemplate: e.target.value,
                    }))
                  }
                >
                  {GITIGNORE_TEMPLATES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Warning when LiteDuck is unchecked */}
            {!two.initDevCanvas && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 px-3 py-2 text-xs text-warning bg-warning-subtle">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Without LiteDuck initialization the directory will not be created automatically.
                  You will need to create it manually before opening.
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button size="sm" onClick={handleCreate}>
                Create Workspace
              </Button>
            </div>
          </>
        )}

        {/* ── Creating ───────────────────────────────────────────────────── */}
        {creationStep === "creating" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-sidebar-primary)]" />
            <p className="text-xs text-[var(--color-muted-foreground)]">Creating workspace...</p>
            {fullPath && (
              <p className="text-[10px] text-[var(--color-muted-foreground)] font-mono truncate max-w-full">
                {fullPath}
              </p>
            )}
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {creationStep === "done" && createdPath && (
          <>
            <div className="mb-4 rounded-md border border-success/30 p-3 bg-success-subtle-10">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold text-[var(--color-foreground)]">
                  Workspace created
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] truncate mb-0.5">
                {truncatePath(createdPath)}
              </p>
              <p className="text-[10px] text-[var(--color-muted-foreground)] font-mono truncate">
                {createdPath}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs">
                <FolderPlus className="h-3.5 w-3.5" />
                Create another
              </Button>
              <Button size="sm" onClick={handleOpen}>
                Open Workspace
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
