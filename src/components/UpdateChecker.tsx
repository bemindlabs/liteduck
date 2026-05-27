import { useState, useEffect, useCallback } from "react";
import { Download, X, RefreshCw, ExternalLink, Rocket } from "lucide-react";
import { checkForUpdate, type UpdateInfo } from "@/lib/updater";
import { getSetting, saveSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { UpdateDialog } from "@/components/UpdateDialog";

/** How often to auto-check (24 hours in ms). */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const SETTINGS_KEY_LAST_CHECK = "updater_last_check";
const SETTINGS_KEY_DISMISSED = "updater_dismissed_version";

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const doCheck = useCallback(async (force = false) => {
    try {
      // Skip if checked recently (unless forced)
      if (!force) {
        const lastCheck = await getSetting(SETTINGS_KEY_LAST_CHECK);
        if (lastCheck) {
          const elapsed = Date.now() - parseInt(lastCheck, 10);
          if (elapsed < CHECK_INTERVAL_MS) return;
        }
      }

      const info = await checkForUpdate();
      await saveSetting(SETTINGS_KEY_LAST_CHECK, Date.now().toString());

      if (info.has_update) {
        // Check if user already dismissed this version
        const dismissedVersion = await getSetting(SETTINGS_KEY_DISMISSED);
        if (dismissedVersion === info.latest_version && !force) {
          return;
        }
        setUpdate(info);
        setDismissed(false);
      }
    } catch {
      // Silently ignore — update check is non-critical
    }
  }, []);

  // Auto-check on mount
  useEffect(() => {
    const timer = setTimeout(() => void doCheck(), 3000);
    return () => clearTimeout(timer);
  }, [doCheck]);

  function handleDismiss() {
    setDismissed(true);
    if (update) {
      void saveSetting(SETTINGS_KEY_DISMISSED, update.latest_version);
    }
  }

  function handleUpdateNow() {
    setDialogOpen(true);
  }

  // Nothing to show (toast)
  if (!update || dismissed) {
    return null;
  }

  return (
    <>
      {/* Toast notification */}
      {!dialogOpen && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-[200] max-w-sm rounded-lg border border-[var(--color-border)]",
            "bg-[var(--color-popover)] p-4 shadow-xl",
            "animate-in slide-in-from-bottom-4 fade-in duration-300",
          )}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <Download className="h-4 w-4 text-emerald-500" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                Update Available
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                LiteDuck <span className="font-mono">v{update.latest_version}</span> is available.
                You're on <span className="font-mono">v{update.current_version}</span>.
              </p>

              {update.published_at && (
                <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]/70">
                  Released {new Date(update.published_at).toLocaleDateString()}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleUpdateNow}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                    "bg-emerald-600 text-white hover:bg-emerald-700 transition-colors",
                  )}
                >
                  <Rocket className="h-3 w-3" />
                  Update Now
                </button>
                <button
                  onClick={handleDismiss}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
                    "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] transition-colors",
                  )}
                >
                  Later
                </button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-md p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              aria-label="Dismiss update notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Update dialog */}
      <UpdateDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          handleDismiss();
        }}
        update={update}
      />
    </>
  );
}

/**
 * Manual check button for use in Settings page.
 */
export function CheckForUpdateButton() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setUpdate(null);
    try {
      const info = await checkForUpdate();
      setUpdate(info);
      await saveSetting(SETTINGS_KEY_LAST_CHECK, Date.now().toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void handleCheck()}
        disabled={checking}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-[var(--color-border)]",
          "bg-[var(--color-muted)] px-3 py-1.5 text-xs font-medium",
          "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
        {checking ? "Checking..." : "Check for Updates"}
      </button>

      {update && !update.has_update && (
        <p className="text-xs text-emerald-500">
          You're on the latest version (v{update.current_version}).
        </p>
      )}

      {update?.has_update && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-500">
            Version {update.latest_version} is available!
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setDialogOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                "bg-emerald-600 text-white hover:bg-emerald-700 transition-colors",
              )}
            >
              <Rocket className="h-3 w-3" />
              Update Now
            </button>
            <a
              href={update.release_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View Release
            </a>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {update?.has_update && (
        <UpdateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} update={update} />
      )}
    </div>
  );
}
