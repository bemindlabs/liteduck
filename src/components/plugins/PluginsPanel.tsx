/**
 * PluginsPanel — the workspace view for LiteDuck's plugin system.
 *
 * Master-detail: a compact **installed list** plus a dedicated **detail page**
 * for the selected plugin (header + its commands + a rendered output area).
 * Command output is rendered via the declarative-view model
 * (`notes/2026-05-28_plugin-declarative-views.md`): each command's manifest
 * `view` selects a trusted built-in renderer (`text` | `table` | `list` |
 * `keyvalue` | `markdown`) over plugin-emitted *data*. No plugin code ever runs
 * in the LiteDuck process.
 *
 * An "Available" tab keeps the GitHub registry browse/install reachable, and
 * install-from-folder / uninstall stay available from the installed view.
 * Renders full-width in the editor area (mirroring how Git / Settings render).
 */

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  BadgeCheck,
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Globe,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  type InstalledPlugin,
  type PluginCommand,
  type RegistryEntry,
  pluginInstall,
  pluginInstallFromRegistry,
  pluginList,
  pluginRegistryFetch,
  pluginRunCommand,
  pluginUninstall,
} from "@/lib/plugins";
import { OutputView } from "./views/OutputView";
import { PluginHostFrame } from "./PluginHostFrame";

const logger = createLogger("PluginsPanel");

/** Public registry repo the Browse view reads from (provenance line). */
const REGISTRY_REPO = "bemindlabs/liteduck-plugins";

type PluginsTab = "installed" | "available";

/** The result of running one command, scoped to a plugin page. */
interface CommandRun {
  pluginId: string;
  commandId: string;
  /** The command's declared view (drives the renderer). */
  view: string | undefined;
  /** Raw stdout. */
  raw: string;
  /** Non-null when the command failed (stderr / non-zero exit). */
  error: string | null;
}

/** Shared network/no-network capability badge. */
function NetworkBadge({ network }: { network: boolean }) {
  return (
    <span
      title={network ? "Declares network access" : "No network access declared"}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
        network
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
      )}
    >
      {network ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {network ? "network" : "no network"}
    </span>
  );
}

export interface PluginsPanelProps {
  /**
   * When set, the panel opens straight to this plugin's detail page (auto-running
   * its `default` command) and the master list + tab chrome are hidden — this is
   * the **full-page surface** used by `surface: "page"` plugins pinned to the
   * activity rail. Absent → the normal master-detail Plugins panel.
   */
  initialPluginId?: string;
  /**
   * Called after the installed set changes (install / uninstall) so the host can
   * refresh live — e.g. the activity rail adds/removes a pinned plugin's icon the
   * moment it is installed/uninstalled, no reload needed.
   */
  onPluginsChanged?: () => void;
  /**
   * When provided, clicking a plugin in the Installed list opens it as its own
   * full-area page (the editor-area surface used by pinned rail icons) instead
   * of navigating to an in-panel detail "second page". This keeps the Plugins
   * panel a pure *manager* (install / uninstall / browse) and avoids duplicating
   * the per-plugin view that already lives on the dedicated page.
   */
  onOpenPluginPage?: (pluginId: string) => void;
}

export function PluginsPanel({
  initialPluginId,
  onPluginsChanged,
  onOpenPluginPage,
}: PluginsPanelProps = {}) {
  // Full-page mode: opened to a single plugin from the activity rail. Hides the
  // master list / tabs and shows just that plugin's detail page (no Back).
  const pageMode = initialPluginId !== undefined;
  // The active workspace. Plugin commands run with this as their CWD so
  // workspace-scoped tools (e.g. `bwoc list`) resolve the open workspace rather
  // than the plugin's install dir. Empty string ("") = no workspace open.
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState<PluginsTab>("installed");
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CommandRun | null>(null);

  // Browse / Available state.
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registryLoaded, setRegistryLoaded] = useState(false);

  const installedIds = new Set(plugins.map((p) => p.id));
  // The Plugins panel is a pure manager (Installed / Available + install /
  // uninstall) — clicking a row opens the plugin's **dedicated page** via
  // onOpenPluginPage. The only PluginDetail render path is the page-mode
  // surface that opens directly to a single plugin (rail-pinned or list-click).
  const selected = pageMode ? (plugins.find((p) => p.id === initialPluginId) ?? null) : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlugins(await pluginList());
    } catch (e) {
      setError(String(e));
      logger.error("Failed to list plugins", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRegistry = useCallback(async () => {
    setRegistryLoading(true);
    setRegistryError(null);
    try {
      setRegistry(await pluginRegistryFetch());
      setRegistryLoaded(true);
    } catch (e) {
      setRegistryError(String(e));
      logger.error("Failed to fetch plugin registry", e);
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lazily fetch the registry the first time the Available tab is opened.
  useEffect(() => {
    if (tab === "available" && !registryLoaded && !registryLoading) {
      void refreshRegistry();
    }
  }, [tab, registryLoaded, registryLoading, refreshRegistry]);

  const handleInstallFromRegistry = useCallback(
    async (entry: RegistryEntry) => {
      setBusy(`registry:${entry.id}`);
      setRegistryError(null);
      try {
        const installed = await pluginInstallFromRegistry(entry.id);
        logger.info(`Installed plugin '${installed.id}' from registry`);
        await refresh();
        onPluginsChanged?.();
      } catch (e) {
        setRegistryError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh, onPluginsChanged],
  );

  const handleInstall = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Install plugin folder",
    });
    if (typeof picked !== "string") return;
    setBusy("install");
    setError(null);
    try {
      const installed = await pluginInstall(picked);
      logger.info(`Installed plugin '${installed.id}'`);
      await refresh();
      onPluginsChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [refresh, onPluginsChanged]);

  const handleUninstall = useCallback(
    async (id: string) => {
      setBusy(id);
      setError(null);
      try {
        await pluginUninstall(id);
        setRun((r) => (r?.pluginId === id ? null : r));
        await refresh();
        onPluginsChanged?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh, onPluginsChanged],
  );

  const handleRun = useCallback(
    async (plugin: InstalledPlugin, command: PluginCommand, params?: Record<string, string>) => {
      setBusy(`${plugin.id}:${command.id}`);
      setError(null);
      try {
        // Forward the active workspace (if any) so the command runs with it as
        // CWD; undefined when none is open → command falls back to the plugin dir.
        // `params` (collected from the per-command arg form) are exported as
        // LITEDUCK_PARAM_<KEY> env vars by the runner; undefined → none.
        const result = await pluginRunCommand(
          plugin.id,
          command.id,
          params,
          workspace || undefined,
        );
        setRun({
          pluginId: plugin.id,
          commandId: command.id,
          view: command.view,
          raw: result.stdout,
          error:
            result.exit_code !== 0 ? result.stderr.trim() || `exited ${result.exit_code}` : null,
        });
      } catch (e) {
        setRun({
          pluginId: plugin.id,
          commandId: command.id,
          view: command.view,
          raw: "",
          error: String(e),
        });
      } finally {
        setBusy(null);
      }
    },
    [workspace],
  );

  // When a plugin is opened from the Installed list, route to its dedicated
  // page (the same view the pinned rail icon opens). No in-panel detail.
  const openPlugin = useCallback(
    (plugin: InstalledPlugin) => onOpenPluginPage?.(plugin.id),
    [onOpenPluginPage],
  );

  // Full-page mode: once the plugin list resolves, open the requested plugin so
  // its `default` command auto-runs as the page body. Re-fires if the operator
  // switches the rail to a different pinned plugin (initialPluginId changes).
  useEffect(() => {
    if (initialPluginId === undefined) return;
    const target = plugins.find((p) => p.id === initialPluginId);
    if (!target) return;
    setRun(null);
    const landing = target.commands.find((c) => c.default);
    if (landing) void handleRun(target, landing);
  }, [initialPluginId, plugins, handleRun]);

  const installedView = tab === "installed";

  // Full-page surface: render just the selected plugin's detail page (no master
  // list, no tabs, no Back). The activity rail / Files icon is how you leave.
  if (pageMode) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--color-background)]">
        {error && (
          <div className="shrink-0 border-b border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-4 py-2 text-xs text-[var(--color-destructive)]">
            {error}
          </div>
        )}
        {selected ? (
          <PluginDetail
            plugin={selected}
            run={run}
            busy={busy}
            onRun={handleRun}
            onUninstall={handleUninstall}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-[var(--color-muted-foreground)]">
            {loading ? "Loading plugin…" : `Plugin '${initialPluginId}' is not installed.`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-background)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-[var(--color-muted-foreground)]" />
          <h1 className="text-sm font-semibold">Plugins</h1>
        </div>
        <div className="flex items-center gap-2">
          {installedView ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => void handleInstall()} disabled={busy === "install"}>
                <Plus className="h-4 w-4" />
                Install from folder
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshRegistry()}
              disabled={registryLoading}
            >
              <RefreshCw className={cn("h-4 w-4", registryLoading && "animate-spin")} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-4">
        <TabButton
          active={installedView}
          onClick={() => setTab("installed")}
          icon={<Boxes className="h-4 w-4" />}
          label="Installed"
          count={plugins.length}
        />
        <TabButton
          active={!installedView}
          onClick={() => setTab("available")}
          icon={<Store className="h-4 w-4" />}
          label="Available"
          count={registryLoaded ? registry.length : undefined}
        />
      </div>

      {installedView && error && (
        <div className="shrink-0 border-b border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-4 py-2 text-xs text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {!installedView ? (
        <AvailableView
          entries={registry}
          loading={registryLoading}
          error={registryError}
          installedIds={installedIds}
          busy={busy}
          onInstall={handleInstallFromRegistry}
        />
      ) : (
        <InstalledList
          plugins={plugins}
          loading={loading}
          busy={busy}
          onOpen={openPlugin}
          onUninstall={handleUninstall}
        />
      )}
    </div>
  );
}

/** A tab in the Plugins panel header (Installed / Available). */
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
          : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-[var(--color-muted)] px-1.5 text-[10px] text-[var(--color-muted-foreground)]">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The compact installed list (master). Each row opens the plugin's detail page;
 * uninstall stays reachable per-row.
 */
function InstalledList({
  plugins,
  loading,
  busy,
  onOpen,
  onUninstall,
}: {
  plugins: InstalledPlugin[];
  loading: boolean;
  busy: string | null;
  onOpen: (plugin: InstalledPlugin) => void;
  onUninstall: (id: string) => void;
}) {
  if (plugins.length === 0 && !loading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto mt-12 max-w-md text-center text-sm text-[var(--color-muted-foreground)]">
          <Boxes className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>No plugins installed.</p>
          <p className="mt-1">
            Plugins live under <code>~/.liteduck/plugins/</code>. Install a folder containing a{" "}
            <code>plugin.json</code> manifest.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <ul className="space-y-2">
        {plugins.map((plugin) => (
          <li key={plugin.id}>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition-colors hover:border-[var(--color-primary)]/50">
              <button
                type="button"
                onClick={() => onOpen(plugin)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Open ${plugin.name}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{plugin.name}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      v{plugin.version}
                    </span>
                    <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
                      {plugin.kind}
                    </span>
                    <NetworkBadge network={plugin.network} />
                  </div>
                  {plugin.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted-foreground)]">
                      {plugin.description}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                title="Uninstall"
                aria-label={`Uninstall ${plugin.name}`}
                onClick={() => onUninstall(plugin.id)}
                disabled={busy === plugin.id}
              >
                <Trash2 className="h-4 w-4 text-[var(--color-destructive)]" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The detail page for one installed plugin, **output-first**: a compact header,
 * a single command **toolbar** (no-arg commands run on click; commands with args
 * toggle a small inline param form), and the rendered **output region as the
 * hero** filling the remaining height. The output is driven by the run command's
 * declared `view`. The plugin's `default` command auto-runs on open (wired by the
 * parent) so the page lands on real data instead of an empty prompt.
 */
function PluginDetail({
  plugin,
  run,
  busy,
  onRun,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  run: CommandRun | null;
  busy: string | null;
  onRun: (plugin: InstalledPlugin, command: PluginCommand, params?: Record<string, string>) => void;
  onUninstall: (id: string) => void;
}) {
  const activeRun = run?.pluginId === plugin.id ? run : null;
  // If a plugin's executable UI (ADR-002) fails to hand-shake, fall back to the
  // declarative views. Tracked by id so switching plugins re-evaluates cleanly.
  const [failedHostId, setFailedHostId] = useState<string | null>(null);
  const useHostUi = !!plugin.ui && failedHostId !== plugin.id;
  const handleHostFallback = useCallback(() => setFailedHostId(plugin.id), [plugin.id]);
  // The arg-command whose inline param form is expanded (only one at a time).
  const [openForm, setOpenForm] = useState<string | null>(null);
  const openCommand = plugin.commands.find((c) => c.id === openForm) ?? null;
  // The landing command — re-run by the Refresh control.
  const defaultCommand = plugin.commands.find((c) => c.default) ?? null;
  const refreshBusy = defaultCommand ? busy === `${plugin.id}:${defaultCommand.id}` : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top action row — Uninstall only. The Plugins panel is the way to
          leave a plugin page (or click another rail icon). */}
      <div className="flex shrink-0 items-center justify-end border-b border-[var(--color-border)] px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          title="Uninstall"
          aria-label={`Uninstall ${plugin.name}`}
          onClick={() => onUninstall(plugin.id)}
          disabled={busy === plugin.id}
          className="text-[var(--color-destructive)]"
        >
          <Trash2 className="h-4 w-4" />
          Uninstall
        </Button>
      </div>

      {/* Compact header */}
      <header className="shrink-0 px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{plugin.name}</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">v{plugin.version}</span>
          <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
            {plugin.kind}
          </span>
          <NetworkBadge network={plugin.network} />
        </div>
        {plugin.description && (
          <p className="mt-1.5 max-w-2xl text-xs text-[var(--color-muted-foreground)]">
            {plugin.description}
          </p>
        )}
        {plugin.paths.length > 0 && (
          <p className="mt-1 truncate text-[10px] text-[var(--color-muted-foreground)]">
            Declared paths: {plugin.paths.join(", ")}
          </p>
        )}
      </header>

      {useHostUi ? (
        /* Executable UI (ADR-002): the plugin renders itself inside an isolated
           `plugin://` iframe. If it never hands-shakes, onFallback flips this to
           the declarative path below — the plugin is never a blank page. */
        <div className="min-h-0 flex-1 overflow-hidden">
          <PluginHostFrame plugin={plugin} onFallback={handleHostFallback} />
        </div>
      ) : (
        <>
          {/* Command toolbar */}
          {plugin.commands.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-y border-[var(--color-border)] bg-[var(--color-muted)]/30 px-5 py-2.5">
              {plugin.commands.map((command) => (
                <CommandButton
                  key={command.id}
                  command={command}
                  active={activeRun?.commandId === command.id}
                  busy={busy === `${plugin.id}:${command.id}`}
                  expanded={openForm === command.id}
                  onClick={() => {
                    if (command.args.length > 0) {
                      setOpenForm((id) => (id === command.id ? null : command.id));
                    } else {
                      setOpenForm(null);
                      onRun(plugin, command);
                    }
                  }}
                />
              ))}
              {defaultCommand && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Re-run the default command"
                  onClick={() => {
                    setOpenForm(null);
                    onRun(plugin, defaultCommand);
                  }}
                  disabled={refreshBusy}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshBusy && "animate-spin")} />
                  Refresh
                </Button>
              )}
            </div>
          )}

          {/* Inline param form for the expanded arg-command (above the output). */}
          {openCommand && (
            <InlineParamForm
              key={openCommand.id}
              plugin={plugin}
              command={openCommand}
              busy={busy === `${plugin.id}:${openCommand.id}`}
              onSubmit={(params) => onRun(plugin, openCommand, params)}
            />
          )}

          {/* Output — the hero. Fills the remaining height and scrolls on its own. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeRun ? (
              activeRun.error ? (
                <div className="space-y-2">
                  <pre className="overflow-auto rounded border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-3 text-xs text-[var(--color-destructive)]">
                    {activeRun.error}
                  </pre>
                  {activeRun.raw.trim() && <OutputView view={activeRun.view} raw={activeRun.raw} />}
                </div>
              ) : (
                <OutputView view={activeRun.view} raw={activeRun.raw} />
              )
            ) : (
              <div className="rounded border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted-foreground)]">
                {plugin.commands.length > 0
                  ? "Run a command above to see its output here."
                  : "This plugin contributes no commands."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Strip a leading "Prefix: " from a command title for compact toolbar labels
 *  ("Jira: View Issue" → "View Issue"). Titles without a short prefix are kept. */
function shortCommandLabel(title: string): string {
  return title.replace(/^[\w .-]{1,24}:\s+/, "");
}

/**
 * One command in the toolbar. No-arg commands run on click (Play icon); commands
 * with args toggle their inline param form (chevron reflects open/closed). The
 * label drops the redundant "Plugin:" prefix; the full title stays as the tooltip.
 */
function CommandButton({
  command,
  active,
  busy,
  expanded,
  onClick,
}: {
  command: PluginCommand;
  active: boolean;
  busy: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  const hasArgs = command.args.length > 0;
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={busy}
      title={command.title}
      aria-expanded={hasArgs ? expanded : undefined}
    >
      {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {shortCommandLabel(command.title)}
      {hasArgs &&
        (expanded ? (
          <ChevronUp className="h-3.5 w-3.5 opacity-60" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        ))}
    </Button>
  );
}

/** Prettify a manifest arg name for use as a label/placeholder ("max_results" → "Max Results"). */
function prettifyArg(arg: string): string {
  return arg
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Optional per-arg placeholder hints (sensible defaults shown to the user). */
const ARG_PLACEHOLDERS: Record<string, string> = {
  assignee: "me · unassigned · any · email@…",
  project: "board/project key, e.g. ALE",
  jql: "advanced — full JQL overrides the filters above",
  max_results: "25",
};

/** Per-arg initial values — seed the inline form so the filter is visible and
 *  active by default (e.g. Assignee pre-filled with "me" → your issues). */
const ARG_DEFAULTS: Record<string, string> = {
  assignee: "me",
};

/**
 * The inline param form for a command that declares `args` — shown above the
 * output when its toolbar button is expanded. One labeled text input per arg laid
 * out in a row; on submit the filled values are collected into `{ argName: value }`
 * and passed as `params` (the runner exports each as `LITEDUCK_PARAM_<KEY>`).
 * Empty values are dropped so the script's own defaults / "required" errors apply.
 */
function InlineParamForm({
  plugin,
  command,
  busy,
  onSubmit,
}: {
  plugin: InstalledPlugin;
  command: PluginCommand;
  busy: boolean;
  onSubmit: (params: Record<string, string>) => void;
}) {
  const args = command.args;
  // Seed initial values from ARG_DEFAULTS so default filters (e.g. assignee="me")
  // are visible and active. The form remounts per command (keyed on command.id),
  // so this initializer re-runs whenever a different command is expanded.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const [arg, def] of Object.entries(ARG_DEFAULTS)) {
      if (args.includes(arg)) seed[arg] = def;
    }
    return seed;
  });

  return (
    <form
      className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const params: Record<string, string> = {};
        for (const arg of args) {
          const v = (values[arg] ?? "").trim();
          if (v) params[arg] = v;
        }
        onSubmit(params);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        {args.map((arg) => {
          const inputId = `${plugin.id}-${command.id}-${arg}`;
          return (
            <label key={arg} htmlFor={inputId} className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted-foreground)]">{prettifyArg(arg)}</span>
              <input
                id={inputId}
                type="text"
                value={values[arg] ?? ""}
                placeholder={ARG_PLACEHOLDERS[arg] ?? prettifyArg(arg)}
                onChange={(e) => setValues((prev) => ({ ...prev, [arg]: e.target.value }))}
                className="w-56 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </label>
          );
        })}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run
        </Button>
      </div>
    </form>
  );
}

/**
 * The Browse / Available view: lists registry entries from the public repo with
 * their capability ask (kind, network, declared paths via the manifest) and an
 * Install / Reinstall button per entry.
 */
function AvailableView({
  entries,
  loading,
  error,
  installedIds,
  busy,
  onInstall,
}: {
  entries: RegistryEntry[];
  loading: boolean;
  error: string | null;
  installedIds: Set<string>;
  busy: string | null;
  onInstall: (entry: RegistryEntry) => void;
}) {
  // Installing an executable-UI plugin (ADR-002) runs third-party code — isolated
  // in a `plugin://` sandbox, but still third-party — so gate it behind explicit
  // consent. `confirmId` is the entry currently awaiting that confirmation.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {/* Provenance line */}
      <p className="mb-3 text-[11px] text-[var(--color-muted-foreground)]">
        Browsing plugins from{" "}
        <code className="rounded bg-[var(--color-muted)] px-1 py-0.5">{REGISTRY_REPO}</code>. Each
        plugin's declared capabilities are shown before install — review them first.
      </p>

      {error && (
        <div className="mb-3 rounded border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md text-center text-sm text-[var(--color-muted-foreground)]">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin opacity-40" />
          <p>Fetching registry…</p>
        </div>
      ) : entries.length === 0 && !error ? (
        <div className="mx-auto mt-12 max-w-md text-center text-sm text-[var(--color-muted-foreground)]">
          <Store className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>No plugins available in the registry.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const installed = installedIds.has(entry.id);
            const installing = busy === `registry:${entry.id}`;
            return (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.name}</span>
                      {entry.version && (
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          v{entry.version}
                        </span>
                      )}
                      {entry.kind && (
                        <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
                          {entry.kind}
                        </span>
                      )}
                      <NetworkBadge network={entry.network} />
                      {entry.verified && (
                        <span
                          title="Verified by the registry"
                          className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                        >
                          <BadgeCheck className="h-3 w-3" />
                          verified
                        </span>
                      )}
                      {entry.ui && (
                        <span
                          title="Ships an executable UI that runs in an isolated plugin:// sandbox"
                          className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-400"
                        >
                          <Boxes className="h-3 w-3" />
                          UI
                        </span>
                      )}
                    </div>
                    {entry.author && (
                      <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                        by {entry.author}
                      </p>
                    )}
                    {entry.description && (
                      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                        {entry.description}
                      </p>
                    )}
                    {entry.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={installed ? "outline" : "default"}
                    size="sm"
                    onClick={() => (entry.ui ? setConfirmId(entry.id) : onInstall(entry))}
                    disabled={installing}
                    title={installed ? "Reinstall / upgrade" : "Install from registry"}
                  >
                    {installing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {installing ? "Installing…" : installed ? "Reinstall" : "Install"}
                  </Button>
                </div>

                {/* Executable-UI consent gate (ADR-002). */}
                {confirmId === entry.id && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <p className="text-amber-700 dark:text-amber-300">
                      <strong>{entry.name}</strong> ships an executable UI. It runs in an isolated{" "}
                      <code>plugin://</code> sandbox (no access to your files or LiteDuck itself),
                      but it is still third-party code. Install it?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setConfirmId(null);
                          onInstall(entry);
                        }}
                        disabled={installing}
                      >
                        <Download className="h-4 w-4" />
                        {installed ? "Reinstall anyway" : "Install anyway"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
