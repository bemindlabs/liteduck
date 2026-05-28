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
  ArrowLeft,
  BadgeCheck,
  Boxes,
  ChevronRight,
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
}

export function PluginsPanel({ initialPluginId }: PluginsPanelProps = {}) {
  // Full-page mode: opened to a single plugin from the activity rail. Hides the
  // master list / tabs and shows just that plugin's detail page (no Back).
  const pageMode = initialPluginId !== undefined;
  // The active workspace. Plugin commands run with this as their CWD so
  // workspace-scoped tools (e.g. `bwoc list`) resolve the open workspace rather
  // than the plugin's install dir. Empty string ("") = no workspace open.
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState<PluginsTab>("installed");
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [selectedId, setSelectedId] = useState(initialPluginId ?? null);
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
  const selected = plugins.find((p) => p.id === selectedId) ?? null;

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
      } catch (e) {
        setRegistryError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
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
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const handleUninstall = useCallback(
    async (id: string) => {
      setBusy(id);
      setError(null);
      try {
        await pluginUninstall(id);
        setRun((r) => (r?.pluginId === id ? null : r));
        setSelectedId((s) => (s === id ? null : s));
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const handleRun = useCallback(
    async (plugin: InstalledPlugin, command: PluginCommand) => {
      setBusy(`${plugin.id}:${command.id}`);
      setError(null);
      try {
        // Forward the active workspace (if any) so the command runs with it as
        // CWD; undefined when none is open → command falls back to the plugin dir.
        const result = await pluginRunCommand(
          plugin.id,
          command.id,
          undefined,
          workspace || undefined,
        );
        setRun({
          pluginId: plugin.id,
          commandId: command.id,
          view: command.view,
          raw: result.stdout,
          error:
            result.exit_code !== 0
              ? result.stderr.trim() || `exited ${result.exit_code}`
              : null,
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

  // When a plugin is opened, auto-run its `default: true` command (landing
  // view) — but only once per selection and only if nothing has run yet.
  const openPlugin = useCallback(
    (plugin: InstalledPlugin) => {
      setSelectedId(plugin.id);
      setRun(null);
      const landing = plugin.commands.find((c) => c.default);
      if (landing) void handleRun(plugin, landing);
    },
    [handleRun],
  );

  // Full-page mode: once the plugin list resolves, open the requested plugin so
  // its `default` command auto-runs as the page body. Re-fires if the operator
  // switches the rail to a different pinned plugin (initialPluginId changes).
  useEffect(() => {
    if (initialPluginId === undefined) return;
    const target = plugins.find((p) => p.id === initialPluginId);
    if (!target) return;
    setSelectedId(initialPluginId);
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
      ) : selected ? (
        <PluginDetail
          plugin={selected}
          run={run}
          busy={busy}
          onBack={() => {
            setSelectedId(null);
            setRun(null);
          }}
          onRun={handleRun}
          onUninstall={handleUninstall}
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
 * The detail page for one installed plugin: header (name / version / kind /
 * network badge / description), its commands as Run buttons, and a rendered
 * output region driven by the run command's declared `view`.
 */
function PluginDetail({
  plugin,
  run,
  busy,
  onBack,
  onRun,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  run: CommandRun | null;
  busy: string | null;
  /** Absent in full-page mode — the activity rail is how you leave the page. */
  onBack?: () => void;
  onRun: (plugin: InstalledPlugin, command: PluginCommand) => void;
  onUninstall: (id: string) => void;
}) {
  const activeRun = run?.pluginId === plugin.id ? run : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Back affordance (master-detail) + uninstall. The Back button is hidden
          in full-page mode where the activity rail handles navigation. */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            All plugins
          </Button>
        ) : (
          <span />
        )}
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

      <div className="space-y-5 p-5">
        {/* Plugin header */}
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{plugin.name}</h2>
            <span className="text-xs text-[var(--color-muted-foreground)]">v{plugin.version}</span>
            <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
              {plugin.kind}
            </span>
            <NetworkBadge network={plugin.network} />
          </div>
          {plugin.description && (
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
              {plugin.description}
            </p>
          )}
          {plugin.paths.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-[var(--color-muted-foreground)]">
              Declared paths: {plugin.paths.join(", ")}
            </p>
          )}
        </header>

        {/* Commands */}
        {plugin.commands.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Commands
            </h3>
            <div className="flex flex-wrap gap-2">
              {plugin.commands.map((command) => (
                <Button
                  key={command.id}
                  variant={activeRun?.commandId === command.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onRun(plugin, command)}
                  disabled={busy === `${plugin.id}:${command.id}`}
                >
                  {busy === `${plugin.id}:${command.id}` ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {command.title}
                </Button>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            This plugin contributes no commands.
          </p>
        )}

        {/* Output region */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Output
          </h3>
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
              Run a command above to see its output here.
            </div>
          )}
        </section>
      </div>
    </div>
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
                    onClick={() => onInstall(entry)}
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
