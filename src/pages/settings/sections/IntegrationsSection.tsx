import { useNavigate } from "react-router-dom";
import { Boxes, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

/**
 * Integrations settings section.
 *
 * LiteDuck core has **no integrations** — they live in opt-in plugins, never in
 * core (per the charter / VISION.md). The former baked-in BWOC integration has
 * been ported to a bundled, opt-in plugin (`resources/plugins/bwoc/`). This
 * section is now a signpost that routes the user to the Plugins panel, where
 * integrations are installed, enabled, and run on demand. Nothing here activates
 * any integration.
 */
export function IntegrationsSection() {
  const navigate = useNavigate();

  return (
    <section
      id="section-integrations"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h3 className="text-base font-medium text-[var(--color-foreground)]">Integrations</h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          LiteDuck core has no built-in integrations. Integrations — such as BWOC and Jira — ship as
          opt-in plugins that you install and run on demand. Nothing runs until you enable it.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md bg-[var(--color-muted)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-foreground)]">Manage plugins</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Install, enable, and run integrations from the Plugins panel.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void navigate(ROUTES.PLUGINS)}
        >
          Open Plugins
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}
