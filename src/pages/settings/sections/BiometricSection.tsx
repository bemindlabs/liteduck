import { useState, useEffect } from "react";
import { ScanFace, Fingerprint, AlertCircle, Lock, LockOpen, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { useBiometric } from "@/contexts/BiometricContext";
import { getSetting, saveSetting } from "@/lib/settings";
import { createLogger } from "@/lib/logger";

const logger = createLogger("BiometricSection");

const TIMEOUT_OPTIONS = [
  { value: "5", label: "5 minutes" },
  { value: "10", label: "10 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "0", label: "Never (manual only)" },
];

export function BiometricSection() {
  const { status, enabled, unlocked, setEnabled, unlock, lock, refreshIdleTimeout } =
    useBiometric();
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleTimeout, setIdleTimeout] = useState("15");

  useEffect(() => {
    getSetting("biometric_idle_timeout_minutes")
      .then((val) => {
        if (val) setIdleTimeout(val);
      })
      .catch((e: unknown) => logger.warn("Failed to load idle timeout:", e));
  }, []);

  async function handleTimeoutChange(value: string) {
    setIdleTimeout(value);
    try {
      await saveSetting("biometric_idle_timeout_minutes", value, false);
      await refreshIdleTimeout();
    } catch (e) {
      logger.warn("Failed to save idle timeout:", e);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setError(null);
    try {
      await setEnabled(!enabled);
    } catch (e) {
      setError(String(e));
    } finally {
      setToggling(false);
    }
  }

  async function handleUnlock() {
    setError(null);
    const ok = await unlock();
    if (!ok) setError("Authentication failed or was cancelled.");
  }

  const available = status?.available ?? false;
  const biometryLabel = status?.biometry_type ?? "Biometric";

  return (
    <section
      id="section-biometric"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <ScanFace className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h3 className="text-base font-medium text-[var(--color-foreground)]">
            Biometric Keychain Lock
          </h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          Require {available ? biometryLabel : "biometric authentication"} to access secrets stored
          in the OS keychain.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md px-3 py-2.5 bg-[var(--color-muted)]">
        <Fingerprint className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-foreground)]">{biometryLabel}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {available
              ? "Hardware detected and ready"
              : "No biometric hardware detected on this device"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            available
              ? "text-success bg-success-subtle"
              : "text-[var(--color-muted-foreground)] bg-muted-subtle",
          )}
        >
          {available ? "Available" : "Unavailable"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Require {available ? biometryLabel : "biometric"} to unlock secrets
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            When enabled, API tokens and secrets require biometric verification once per session
            before they can be read or modified.
          </p>
        </div>
        <button
          type="button"
          disabled={!available || toggling}
          onClick={handleToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]",
            (!available || toggling) && "opacity-50 cursor-not-allowed",
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      {enabled && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-foreground)]">
                  Idle auto-lock timeout
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Lock the keychain after a period of inactivity.
                </p>
              </div>
            </div>
            <Select
              size="sm"
              value={idleTimeout}
              onChange={(e) => handleTimeoutChange(e.target.value)}
            >
              {TIMEOUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              {unlocked ? (
                <LockOpen className="h-4 w-4 text-success" />
              ) : (
                <Lock className="h-4 w-4 text-[var(--color-destructive)]" />
              )}
              <span className="text-sm text-[var(--color-foreground)]">
                {unlocked ? "Keychain unlocked for this session" : "Keychain is locked"}
              </span>
            </div>
            {unlocked ? (
              <button
                type="button"
                onClick={lock}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
              >
                <Lock className="h-3.5 w-3.5" />
                Lock Now
              </button>
            ) : (
              <button
                type="button"
                onClick={handleUnlock}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-input)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] transition-colors hover:opacity-90"
              >
                <ScanFace className="h-3.5 w-3.5" />
                Unlock
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-[var(--color-destructive)]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </section>
  );
}
