import { useState, useEffect } from "react";
import { Boxes, Loader2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSetting, saveSetting } from "@/lib/settings";
import { bwocDetect, bwocList, type BwocStatus, type BwocAgent } from "@/lib/bwoc";
import { createLogger } from "@/lib/logger";

const logger = createLogger("IntegrationsSection");

const BWOC_REPO_URL = "https://github.com/bemindlabs/BWOC-Framework";

export function IntegrationsSection() {
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState<BwocStatus | null>(null);
  const [detecting, setDetecting] = useState(true);
  const [agents, setAgents] = useState<BwocAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  // ── Load the opt-in flag + run detection on mount ──────────────────────────

  useEffect(() => {
    let cancelled = false;

    Promise.all([getSetting("bwoc_integration_enabled"), bwocDetect()])
      .then(([flag, detected]) => {
        if (cancelled) return;
        setEnabled(flag === "true");
        setStatus(detected);
      })
      .catch((e: unknown) => {
        if (!cancelled) logger.warn("Failed to detect BWOC:", e);
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load the agent list when enabled AND installed ──────────────────────────

  useEffect(() => {
    if (!enabled || !status?.installed) {
      setAgents([]);
      setAgentsError(null);
      return;
    }

    let cancelled = false;
    setAgentsLoading(true);
    setAgentsError(null);

    bwocList()
      .then((list) => {
        if (!cancelled) setAgents(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setAgentsError(String(e));
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, status?.installed]);

  async function handleToggle() {
    setToggling(true);
    try {
      const next = !enabled;
      await saveSetting("bwoc_integration_enabled", next ? "true" : "false", false);
      setEnabled(next);
    } catch (e) {
      logger.warn("Failed to save BWOC integration toggle:", e);
    } finally {
      setToggling(false);
    }
  }

  const installed = status?.installed ?? false;

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
          Optional, read-only integration with the BWOC agent-orchestration CLI. LiteDuck never runs
          agents — this only detects the binary and shows status.
        </p>
      </div>

      {/* Detection status */}
      <div className="flex items-center gap-3 rounded-md px-3 py-2.5 bg-[var(--color-muted)]">
        <Boxes className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <div className="flex-1 min-w-0">
          {detecting ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Detecting BWOC...
            </p>
          ) : installed ? (
            <>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                BWOC detected{status?.version ? ` (v${status.version})` : ""}
              </p>
              {status?.path && (
                <p className="truncate text-xs font-mono text-[var(--color-muted-foreground)]">
                  {status.path}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                BWOC is not installed
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Install the BWOC Framework to enable this integration —{" "}
                <a
                  href={BWOC_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-[var(--color-primary)] underline-offset-2 hover:underline"
                >
                  bemindlabs/BWOC-Framework
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </>
          )}
        </div>
        {!detecting && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              installed
                ? "text-success bg-success-subtle"
                : "text-[var(--color-muted-foreground)] bg-muted-subtle",
            )}
          >
            {installed ? "Detected" : "Not found"}
          </span>
        )}
      </div>

      {/* Opt-in toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Enable BWOC integration
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            When enabled, LiteDuck reads the registered agent roster from the BWOC CLI and displays
            it below. Read-only — no agents are spawned or modified.
          </p>
        </div>
        <button
          type="button"
          disabled={toggling}
          onClick={handleToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]",
            toggling && "opacity-50 cursor-not-allowed",
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

      {/* Agent roster (only when enabled + installed) */}
      {enabled && installed && (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-foreground)]">Registered agents</p>
          {agentsLoading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agents...
            </p>
          ) : agentsError ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-destructive)]">
              <AlertCircle className="h-4 w-4" />
              {agentsError}
            </p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No agents registered.</p>
          ) : (
            <ul className="space-y-1.5">
              {agents.map((agent, i) => (
                <li
                  key={`${agent.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                  <div className="min-w-0 flex-1">
                    {agent.name ? (
                      <>
                        <span className="text-sm font-medium text-[var(--color-foreground)]">
                          {agent.name}
                        </span>
                        {agent.role && (
                          <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                            {agent.role}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="truncate text-xs font-mono text-[var(--color-muted-foreground)]">
                        {agent.raw}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
