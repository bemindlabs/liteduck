import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowDownToLine,
  RotateCcw,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  downloadUpdate,
  installUpdate,
  type UpdateInfo,
  type DownloadProgress,
} from "@/lib/updater";
import { cn } from "@/lib/utils";

type UpdateStep = "info" | "downloading" | "ready" | "installing" | "error";

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  update: UpdateInfo;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function UpdateDialog({ open, onClose, update }: UpdateDialogProps) {
  const [step, setStep] = useState<UpdateStep>("info");
  const [progress, setProgress] = useState({
    downloaded: 0,
    total: 0,
    percentage: 0,
  });
  const [downloadedPath, setDownloadedPath] = useState("");
  const [error, setError] = useState("");

  // Reset state when dialog transitions from closed to open.
  // Track previous open value with useState so React can diff it during render
  // without violating the refs-during-render rule.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep("info");
      setProgress({ downloaded: 0, total: 0, percentage: 0 });
      setDownloadedPath("");
      setError("");
    }
  }

  // Listen for download progress events
  useEffect(() => {
    if (!open || step !== "downloading") return;

    let unlisten: (() => void) | undefined;

    void listen<DownloadProgress>("update-download-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [open, step]);

  const handleDownload = useCallback(async () => {
    if (!update.download_url) {
      setError("No download available for your platform.");
      setStep("error");
      return;
    }

    setStep("downloading");
    setError("");

    try {
      const path = await downloadUpdate(update.download_url, update.download_filename);
      setDownloadedPath(path);
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }, [update]);

  const handleInstall = useCallback(async () => {
    if (!downloadedPath) return;

    setStep("installing");
    try {
      await installUpdate(downloadedPath);
      // After launching installer, close the dialog.
      // The user will complete installation externally.
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }, [downloadedPath, onClose]);

  const handleRetry = useCallback(() => {
    setStep("info");
    setError("");
    setProgress({ downloaded: 0, total: 0, percentage: 0 });
  }, []);

  return (
    <Dialog open={open} onClose={onClose} aria-label="Software Update" size="max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
          <Rocket className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            Software Update
          </h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            LiteDuck v{update.latest_version} is available
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Version comparison */}
        <div className="flex items-center gap-3 rounded-lg bg-[var(--color-muted)] p-3">
          <div className="flex-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Current
            </p>
            <p className="mt-0.5 text-sm font-mono font-semibold text-[var(--color-foreground)]">
              v{update.current_version}
            </p>
          </div>
          <ArrowDownToLine className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              New Version
            </p>
            <p className="mt-0.5 text-sm font-mono font-semibold text-emerald-500">
              v{update.latest_version}
            </p>
          </div>
        </div>

        {/* Release notes */}
        {update.release_notes && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-foreground)]">Release Notes</p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs text-[var(--color-muted-foreground)] whitespace-pre-wrap leading-relaxed">
              {update.release_notes}
            </div>
          </div>
        )}

        {/* Download info */}
        {update.download_filename && step === "info" && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <Download className="h-3.5 w-3.5" />
            <span>{update.download_filename}</span>
            {update.download_size > 0 && (
              <span className="text-[var(--color-muted-foreground)]/70">
                ({formatBytes(update.download_size)})
              </span>
            )}
          </div>
        )}

        {/* Download progress */}
        {step === "downloading" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-muted-foreground)]">Downloading...</span>
              <span className="font-mono text-[var(--color-foreground)]">
                {progress.percentage.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${Math.min(progress.percentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--color-muted-foreground)]">
              <span>{formatBytes(progress.downloaded)}</span>
              {progress.total > 0 && <span>{formatBytes(progress.total)}</span>}
            </div>
          </div>
        )}

        {/* Ready to install */}
        {step === "ready" && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-500">Download Complete</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Ready to install. The installer will open and LiteDuck will close.
              </p>
            </div>
          </div>
        )}

        {/* Installing */}
        {step === "installing" && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--color-muted)] p-3">
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-[var(--color-muted-foreground)]">Launching installer...</p>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-500">Update Failed</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] break-words">
                {error}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
        <a
          href={update.release_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View on GitHub
        </a>

        <div className="flex items-center gap-2">
          {step !== "downloading" && step !== "installing" && (
            <Button variant="outline" size="sm" onClick={onClose}>
              {step === "ready" ? "Later" : "Cancel"}
            </Button>
          )}

          {step === "info" && (
            <Button
              size="sm"
              onClick={() => void handleDownload()}
              disabled={!update.download_url}
              className={cn(
                "gap-1.5",
                update.download_url ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Download & Install
            </Button>
          )}

          {step === "ready" && (
            <Button
              size="sm"
              onClick={() => void handleInstall()}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Rocket className="h-3.5 w-3.5" />
              Install Now
            </Button>
          )}

          {step === "error" && (
            <Button size="sm" variant="outline" onClick={handleRetry} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
