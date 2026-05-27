import { useState, useEffect } from "react";
import { Fingerprint, Loader2, AlertCircle, RefreshCw, Save, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSetting, saveSetting } from "@/lib/settings";
import { deviceGetIdentity, deviceResetIdentity, type DeviceIdentity } from "@/lib/device";

export function IdentitySection() {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    Promise.all([deviceGetIdentity(), getSetting("chat_display_name")])
      .then(([id, name]) => {
        setIdentity(id);
        setDisplayName(name ?? "");
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    setConfirmReset(false);
    setError(null);
    try {
      const fresh = await deviceResetIdentity();
      setIdentity(fresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <section
      id="section-identity"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h3 className="text-base font-medium text-[var(--color-foreground)]">Device Identity</h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          A stable identifier for this installation, retained across sessions.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading device identity...
        </p>
      ) : error ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-destructive)]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      ) : identity ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-foreground)]">
              Device ID
            </label>
            <input
              type="text"
              readOnly
              value={identity.device_id}
              className={cn(
                "w-full rounded-md border border-[var(--color-input)] bg-[var(--color-muted)]",
                "px-3 py-2 text-sm font-mono text-[var(--color-foreground)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
                "cursor-default select-all",
              )}
              title="Click to select all"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Unique identifier for this device. Read-only.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-foreground)]">
              Chat Display Name
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setNameSaved(false);
                }}
                placeholder={identity.device_id.slice(0, 8)}
                className={cn(
                  "flex-1 rounded-md border border-[var(--color-input)] bg-[var(--color-background)]",
                  "px-3 py-2 text-sm text-[var(--color-foreground)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
                )}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={async () => {
                  const trimmed = displayName.trim();
                  await saveSetting("chat_display_name", trimmed);
                  setNameSaved(true);
                  setTimeout(() => setNameSaved(false), 2000);
                }}
              >
                {nameSaved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              A display name for this device. Leave blank to use device ID prefix. Changes are
              broadcast to connected peers immediately.
            </p>
          </div>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            Created: {new Date(identity.created_at).toLocaleString()}
          </p>

          <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                confirmReset
                  ? "border-[var(--color-border)] bg-[var(--color-destructive)] text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]"
                  : "border-[var(--color-input)] bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
              )}
            >
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {resetting
                ? "Resetting..."
                : confirmReset
                  ? "Click again to confirm reset"
                  : "Reset Device Identity"}
            </button>

            {confirmReset && !resetting && (
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
