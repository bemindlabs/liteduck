import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetAllSettings } from "@/lib/settings";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ROUTES } from "@/lib/routes";

type ResetStatus = "idle" | "confirming" | "resetting" | "done" | "error";

const CONFIRM_PHRASE = "RESET";
const REDIRECT_DELAY_MS = 1500;

export function DangerZoneSection() {
  const navigate = useNavigate();
  const { clearWorkspace } = useWorkspace();
  const [status, setStatus] = useState<ResetStatus>("idle");
  const [confirmInput, setConfirmInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // After a successful reset, redirect to the landing page so the user starts
  // from a clean slate. `replace: true` keeps the back button from returning
  // to a now-stale Settings view. Cleanup handles unmount or status change
  // before the timer fires (e.g. user navigates away manually).
  useEffect(() => {
    if (status !== "done") return;
    const timer = window.setTimeout(() => {
      void navigate(ROUTES.LANDING, { replace: true });
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status, navigate]);

  function handleResetClick() {
    setStatus("confirming");
    setConfirmInput("");
    setErrorMessage("");
  }

  function handleCancel() {
    setStatus("idle");
    setConfirmInput("");
    setErrorMessage("");
  }

  async function handleConfirmReset() {
    if (confirmInput !== CONFIRM_PHRASE) return;

    setStatus("resetting");
    setErrorMessage("");

    try {
      await resetAllSettings();
      // Clear the in-memory workspace context so WorkspaceGate doesn't
      // re-enter the now-stale workspace once the redirect lands. The
      // backend just truncated the settings table, so persisted state
      // is already gone — this lines up the in-memory mirror.
      clearWorkspace();
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <section
      id="section-danger"
      aria-labelledby="section-danger-heading"
      className="scroll-mt-6 rounded-lg border border-[var(--color-destructive)]/40 bg-[var(--color-card)] p-5 space-y-5"
    >
      <div className="border-b border-[var(--color-destructive)]/30 pb-3">
        <h3
          id="section-danger-heading"
          className="flex items-center gap-2 text-base font-medium text-[var(--color-destructive)]"
        >
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          Danger Zone
        </h3>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          Irreversible actions that affect your data and configuration.
        </p>
      </div>

      <div className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-[var(--color-foreground)]">Reset All Settings</p>
            <p
              id="reset-action-description"
              className="text-xs text-[var(--color-muted-foreground)]"
            >
              Resets global settings to defaults and clears saved tokens from the system keychain.
              Workspace files and per-workspace settings are <strong>preserved</strong>. This cannot
              be undone.
            </p>
          </div>

          {status === "idle" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetClick}
              aria-describedby="reset-action-description"
              className="shrink-0 gap-1.5 border-[var(--color-destructive)]/50 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 hover:border-[var(--color-destructive)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Everything
            </Button>
          )}
        </div>

        {status === "confirming" && (
          <div className="space-y-3 pt-1">
            <p
              id="reset-confirm-instruction"
              className="text-xs text-[var(--color-muted-foreground)]"
            >
              Type{" "}
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-foreground)]">
                {CONFIRM_PHRASE}
              </kbd>{" "}
              to confirm.
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={`Type ${CONFIRM_PHRASE} to confirm`}
              autoFocus
              aria-label={`Type ${CONFIRM_PHRASE} to confirm reset`}
              aria-describedby="reset-confirm-instruction"
              aria-required="true"
              aria-invalid={confirmInput.length > 0 && confirmInput !== CONFIRM_PHRASE}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-destructive)]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleConfirmReset}
                disabled={confirmInput !== CONFIRM_PHRASE}
                className="gap-1.5 bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/90 disabled:opacity-40"
              >
                Confirm Reset
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {status === "resetting" && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Resetting...
          </p>
        )}

        {status === "done" && (
          <div role="status" aria-live="polite" className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Settings have been reset. Returning to the landing page…
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Restart the app for all changes (e.g. preloaded secrets) to take full effect.
            </p>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-[var(--color-destructive)]">
              Reset failed: {errorMessage || "An unexpected error occurred."}
            </p>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
