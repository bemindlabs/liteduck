import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { getAppVersion } from "@/lib/version";
import { FolderOpen, Plus, Clock, ChevronRight, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasNativeCapabilities } from "@/lib/platform";
import { LiteDuckLogo } from "@/components/LiteDuckLogo";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { truncatePath } from "@/lib/truncate-path";

// ── Action card config ──────────────────────────────────────────────────────

interface ActionCard {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  primary?: boolean;
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: "open",
    icon: FolderOpen,
    label: "Open Workspace",
    description: "Browse local folders",
    primary: true,
  },
  { id: "create", icon: Plus, label: "Create New", description: "Start a fresh project" },
];

// ── Landing Page ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const { workspace, recentWorkspaces, setWorkspace, removeFromRecent } = useWorkspace();

  const [version, setVersion] = useState("");

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  async function handlePickFolder(title: string) {
    try {
      const selected = await openDialog({ directory: true, multiple: false, title });
      if (selected) {
        await setWorkspace(selected);
        void navigate(ROUTES.TERMINAL, { replace: true });
      }
    } catch {
      // user cancelled
    }
  }

  function handleSelectRecent(rw: { path: string }) {
    void setWorkspace(rw.path).then(() => {
      void navigate(ROUTES.TERMINAL, { replace: true });
    });
  }

  const actionHandlers: Record<string, () => void> = {
    open: () => void handlePickFolder("Open Workspace Directory"),
    create: () => void handlePickFolder("Create New Workspace"),
  };

  return (
    <div className="safe-area-pad safe-area-bottom relative flex flex-1 h-full overflow-y-auto bg-[var(--color-background)]">
      <div className="relative mx-auto flex w-full max-w-lg md:max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-3 py-4 sm:px-5">
        {/* ── Hero / Branding ─────────────────────────────────────────────── */}
        <div className="relative flex flex-col items-center gap-0 text-center animate-in fade-in duration-500">
          {/* Ambient glow behind logo */}
          <div className="pointer-events-none absolute -top-8 h-40 w-40 rounded-full bg-[var(--color-primary)] opacity-[0.08] blur-3xl" />
          <div className="relative flex h-28 w-28 items-center justify-center">
            <LiteDuckLogo className="h-full w-full drop-shadow-lg" decorative />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)]">
              LiteDuck
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              A lightweight code editor. Open a workspace to browse files, run a terminal, and
              manage Git.
            </p>
          </div>
        </div>

        {/* ── Action Cards ────────────────────────────────────────────────── */}
        {hasNativeCapabilities() ? (
          <div className="grid w-full grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
            {ACTION_CARDS.map(({ id, icon: Icon, label, description, primary }, i) => (
              <button
                key={id}
                onClick={() => actionHandlers[id]()}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-5 transition-all duration-200",
                  "hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-[var(--color-primary)]/5 hover:-translate-y-0.5",
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-110",
                    primary
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-md shadow-[var(--color-primary)]/20"
                      : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] group-hover:bg-[var(--color-accent)]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-medium text-[var(--color-foreground)]">
                    {label}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Open this app on a desktop to browse local workspaces.
          </p>
        )}

        {/* ── Recent Workspaces ───────────────────────────────────────────── */}
        {recentWorkspaces.length > 0 && (
          <section className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
            <SectionHeader icon={Clock} label="Recent Workspaces" />
            <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
              {recentWorkspaces.map((rw, i) => (
                <button
                  key={rw.path}
                  onClick={() => handleSelectRecent(rw)}
                  className={cn(
                    "group flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150",
                    "hover:bg-[var(--color-accent)]",
                    rw.path === workspace && "bg-[var(--color-accent)]/60",
                    i > 0 && "border-t border-[var(--color-border)]",
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                      <FolderOpen className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="text-sm font-medium text-[var(--color-foreground)]">
                        {truncatePath(rw.path)}
                      </span>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {rw.path}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeFromRecent(rw.path);
                      }}
                      className="rounded-md p-1 text-[var(--color-muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] group-hover:opacity-100"
                      aria-label={`Remove ${truncatePath(rw.path)} from recent`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex w-full items-center justify-between animate-in fade-in duration-500 delay-400">
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            LiteDuck v{version} — Bemind Technology
          </p>
          <button
            onClick={() => navigate(ROUTES.SETTINGS)}
            className="rounded-lg p-2 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared section header ───────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
      <Icon className="h-3.5 w-3.5" />
      {label}
      <div className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}
