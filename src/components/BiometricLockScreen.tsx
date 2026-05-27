import { useState } from "react";
import { Lock, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBiometric } from "@/contexts/BiometricContext";

/**
 * Full-screen overlay that blocks the app when biometric is enabled and
 * the session is locked. Renders nothing when unlocked or biometric is off.
 */
export function BiometricLockScreen() {
  const { enabled, unlocked, unlock, status } = useBiometric();
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render when biometric is disabled or session is unlocked.
  if (!enabled || unlocked) return null;

  async function handleUnlock() {
    setAuthenticating(true);
    setError(null);
    const ok = await unlock();
    setAuthenticating(false);
    if (!ok) setError("Authentication failed. Please try again.");
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--color-background)]/95 backdrop-blur-lg">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-accent)]/50">
          <Lock className="h-10 w-10 text-[var(--color-muted-foreground)]" />
        </div>

        <div>
          <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
            LiteDuck is Locked
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
            {status?.biometry_type && status.biometry_type !== "Unavailable"
              ? `Use ${status.biometry_type} to unlock`
              : "Authenticate to unlock"}
          </p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <Button
          onClick={() => void handleUnlock()}
          disabled={authenticating}
          className="gap-2"
          size="lg"
        >
          {authenticating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Fingerprint className="h-4 w-4" />
          )}
          {authenticating ? "Authenticating..." : "Unlock"}
        </Button>
      </div>
    </div>
  );
}
