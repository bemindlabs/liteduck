import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  ArrowRight,
  ArrowLeft,
  SkipForward,
  CheckCircle2,
  Loader2,
  Terminal,
  FolderTree,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LiteDuckLogo } from "@/components/LiteDuckLogo";
import { getSetting, saveSetting } from "@/lib/settings";
import { workspaceInit } from "@/lib/workspace";
import { createLogger } from "@/lib/logger";
import { markWizardCompletedForWorkspace } from "@/lib/wizard";
import { WorkspaceStep } from "@/components/wizard/WorkspaceStep";
import { InitialProjectStep } from "@/components/wizard/InitialProjectStep";

const logger = createLogger("Wizard");

// ── Types ─────────────────────────────────────────────────────────────────────

interface WizardStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<WizardStepProps>;
  optional?: boolean;
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: WizardStepProps) {
  return (
    <div className="flex flex-col items-center gap-8 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-card)] via-[var(--color-accent)] to-[var(--color-secondary)] p-2">
        <LiteDuckLogo className="h-full w-full" decorative />
      </div>

      <div className="space-y-3">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)]">
          Welcome to LiteDuck
        </h2>
        <p className="max-w-md text-base text-[var(--color-muted-foreground)] leading-relaxed">
          A lightweight code editor — browse and edit your project files, run an integrated
          terminal, and manage Git, all in one workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 w-full max-w-lg text-left">
        {[
          {
            icon: FolderTree,
            title: "File editor",
            desc: "Browse and edit your project files",
          },
          {
            icon: Terminal,
            title: "Integrated terminal",
            desc: "Run shells in split panes",
          },
          {
            icon: GitBranch,
            title: "Git built in",
            desc: "Branches, diffs, and worktrees",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
          >
            <Icon className="h-4 w-4 text-[var(--color-sidebar-primary)]" />
            <p className="text-sm font-medium text-[var(--color-foreground)]">{title}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{desc}</p>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="mt-2 gap-2">
        Let&apos;s get started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Final step: Summary ───────────────────────────────────────────────────────

interface SummaryStepProps extends WizardStepProps {
  skippedSteps: Set<string>;
  setWorkspace: (dir: string) => Promise<void>;
}

function SummaryStep({ onNext, skippedSteps, setWorkspace }: SummaryStepProps) {
  const [finishing, setFinishing] = useState(false);

  const services = [
    {
      id: "workspace",
      label: "Workspace Directory",
      icon: FolderTree,
    },
    {
      id: "initial-project",
      label: "Project Setup",
      icon: CheckCircle2,
    },
  ];

  async function handleFinish() {
    setFinishing(true);
    try {
      const workspaceDir = await getSetting("workspace_directory");
      if (workspaceDir) {
        try {
          await workspaceInit(workspaceDir);
        } catch (err) {
          logger.warn("Failed to initialize workspace templates:", err);
        }
      }
      await saveSetting("wizard_completed", "true");
      // Mark this workspace as wizard-completed so switching back
      // to it later won't re-trigger the wizard.
      if (workspaceDir) {
        await markWizardCompletedForWorkspace(workspaceDir);
        // Update the workspace context so the main layout picks it up
        // immediately instead of requiring a manual workspace selection.
        await setWorkspace(workspaceDir);
      }
    } finally {
      setFinishing(false);
    }
    onNext();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
          You&apos;re all set!
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Here&apos;s a summary of what you configured. You can always update these settings later.
        </p>
      </div>

      <div className="space-y-2">
        {services.map(({ id, label, icon: Icon }) => {
          const configured = !skippedSteps.has(id);
          return (
            <div
              key={id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3",
                configured
                  ? "border-success/30 bg-success-subtle"
                  : "border-[var(--color-border)] bg-[var(--color-background)]",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  configured ? "text-success" : "text-[var(--color-muted-foreground)]",
                )}
              />
              <span className="flex-1 text-sm font-medium text-[var(--color-foreground)]">
                {label}
              </span>
              {configured ? (
                <span className="flex items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Configured
                </span>
              ) : (
                <span className="text-xs text-[var(--color-muted-foreground)]">Skipped</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)] px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-[var(--color-foreground)]">What&apos;s next?</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Open a terminal, browse your files, or review Git changes. Use{" "}
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>{" "}
          to open the command palette at any time.
        </p>
      </div>

      <Button size="lg" onClick={handleFinish} disabled={finishing} className="gap-2">
        {finishing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
        {finishing ? "Finishing..." : "Get Started"}
      </Button>
    </div>
  );
}

// ── Wizard step registry ──────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Introduction to LiteDuck",
    component: WelcomeStep,
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Set your project directory",
    component: WorkspaceStep,
  },
  {
    id: "initial-project",
    title: "Initial Project",
    description: "Scaffold your project",
    component: InitialProjectStep,
    optional: true,
  },
  {
    id: "summary",
    title: "Summary",
    description: "Review configuration",
    component: () => null, // rendered inline with extra props
  },
];

// ── Progress dots ─────────────────────────────────────────────────────────────

interface ProgressDotsProps {
  total: number;
  current: number;
}

function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="list"
      aria-label="Wizard progress"
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          role="listitem"
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "rounded-full transition-all duration-300",
            i === current
              ? "h-2.5 w-8 bg-[var(--color-sidebar-primary)]"
              : i < current
                ? "h-2.5 w-2.5 bg-[var(--color-sidebar-primary)]"
                : "h-2.5 w-2.5 bg-[var(--color-border)]",
          )}
        />
      ))}
    </div>
  );
}

// ── WizardPage ────────────────────────────────────────────────────────────────

export default function WizardPage() {
  const navigate = useNavigate();
  const { setWorkspace } = useWorkspace();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState(new Set<string>());

  const currentStep = STEPS[currentIndex];
  const isLastStep = currentIndex === STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      // Navigate to the main workspace page (not the landing/workspace picker)
      // since the wizard already configured the workspace.
      void navigate(ROUTES.HOME, { replace: true });
      return;
    }
    setCurrentIndex((i) => i + 1);
  }, [isLastStep, navigate]);

  const handleBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleSkip = useCallback(() => {
    setSkippedSteps((prev) => new Set([...prev, currentStep.id]));
    setCurrentIndex((i) => i + 1);
  }, [currentStep.id]);

  const StepComponent = currentStep.component;

  return (
    <div className="safe-area-pad flex flex-1 h-full items-center justify-center overflow-y-auto bg-[var(--color-background)] p-4">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="mb-8">
          <ProgressDots total={STEPS.length} current={currentIndex} />
          <p className="mt-3 text-center text-xs text-[var(--color-muted-foreground)]">
            Step {currentIndex + 1} of {STEPS.length} —{" "}
            <span className="font-medium text-[var(--color-foreground)]">{currentStep.title}</span>
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-8 shadow-sm">
          {isLastStep ? (
            <SummaryStep
              onNext={handleNext}
              onBack={handleBack}
              onSkip={handleSkip}
              skippedSteps={skippedSteps}
              setWorkspace={setWorkspace}
            />
          ) : (
            <StepComponent onNext={handleNext} onBack={handleBack} onSkip={handleSkip} />
          )}
        </div>

        {/* Navigation footer — hidden for Welcome (has its own CTA) and Summary */}
        {currentIndex !== 0 && !isLastStep && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5 text-[var(--color-muted-foreground)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {currentStep.optional && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="gap-1.5 text-[var(--color-muted-foreground)]"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                </Button>
              )}

              {/* The step renders a hidden #wizard-next-override button with
                  custom label/disabled state. We proxy its click here. */}
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const override = document.getElementById(
                    "wizard-next-override",
                  ) as HTMLButtonElement | null;
                  if (override) {
                    override.click();
                  } else {
                    handleNext();
                  }
                }}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wizard gate ───────────────────────────────────────────────────────────────

/**
 * Call this once on app mount to decide whether the wizard should run.
 * Returns true when `wizard_completed` is not yet set.
 */
// eslint-disable-next-line react-refresh/only-export-components
export async function shouldShowWizard(): Promise<boolean> {
  try {
    const val = await getSetting("wizard_completed");
    return val !== "true";
  } catch {
    return true;
  }
}
