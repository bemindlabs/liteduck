import { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { CheckForUpdateButton } from "@/components/UpdateChecker";
import { getAppVersion } from "@/lib/updater";

export function AboutSection() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  return (
    <section
      id="section-about"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h3 className="text-base font-medium text-[var(--color-foreground)]">About</h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          Application version and updates.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-foreground)]">LiteDuck</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {version ? `Version ${version}` : "Loading..."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--color-foreground)]">
            Software Updates
          </label>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Checks the latest release on GitHub. Updates are checked automatically every 24 hours.
          </p>
          <CheckForUpdateButton />
        </div>
      </div>
    </section>
  );
}
