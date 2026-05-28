/**
 * PluginsPanel — the workspace view for LiteDuck's plugin system.
 *
 * Lists installed plugins (`~/.liteduck/plugins/`), each with name / version /
 * kind and a network badge. Supports install (folder picker), uninstall, and
 * running a plugin's contributed commands. Renders full-width in the editor
 * area (mirroring how Git / Settings render), not in the narrow side panel.
 *
 * The plugin model is hybrid (declarative manifest + shell command): the host
 * never loads plugin code. Network access and declared host paths are surfaced
 * before install so there is no silent network (user-trust v1; no OS sandbox).
 */

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  BadgeCheck,
  Boxes,
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

const logger = createLogger("PluginsPanel");

/** Public registry repo the Browse view reads from (provenance line). */
const REGISTRY_REPO = "bemindlabs/liteduck-plugins";

type PluginsTab = "installed" | "available";

/** Render a result-table cell value as text, JSON-encoding non-primitives. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

interface CommandRun {
  pluginId: string;
  commandId: string;
  /** Parsed `issues` rows when the output is a Jira-style list, else null. */
  rows: Record<string, unknown>[] | null;
  /** Raw stdout (shown when rows could not be parsed). */
  raw: string;
  error: string | null;
}

export function PluginsPanel() {
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
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Install plugin folder",
    });
    if (typeof selected !== "string") return;
    setBusy("install");
    setError(null);
    try {
      const installed = await pluginInstall(selected);
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
        if (result.exit_code !== 0) {
          setRun({
            pluginId: plugin.id,
            commandId: command.id,
            rows: null,
            raw: result.stdout,
            error: result.stderr.trim() || `exited ${result.exit_code}`,
          });
          return;
        }
        let rows: Record<string, unknown>[] | null = null;
        try {
          const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
          if (Array.isArray(parsed.issues)) {
            rows = parsed.issues as Record<string, unknown>[];
          } else if (parsed.issue && typeof parsed.issue === "object") {
            rows = [parsed.issue as Record<string, unknown>];
          }
        } catch {
          // Non-JSON output is fine — show it raw.
        }
        setRun({
          pluginId: plugin.id,
          commandId: command.id,
          rows,
          raw: result.stdout,
          error: null,
        });
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [workspace],
  );

  const installedView = tab === "installed";

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
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {plugins.length === 0 && !loading ? (
            <div className="mx-auto mt-12 max-w-md text-center text-sm text-[var(--color-muted-foreground)]">
              <Boxes className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No plugins installed.</p>
              <p className="mt-1">
                Plugins live under <code>~/.liteduck/plugins/</code>. Install a folder containing a{" "}
                <code>plugin.json</code> manifest.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {plugins.map((plugin) => (
                <li
                  key={plugin.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{plugin.name}</span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          v{plugin.version}
                        </span>
                        <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-secondary-foreground)]">
                          {plugin.kind}
                        </span>
                        <span
                          title={
                            plugin.network
                              ? "Declares network access"
                              : "No network access declared"
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                            plugin.network
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                          )}
                        >
                          {plugin.network ? (
                            <Globe className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {plugin.network ? "network" : "no network"}
                        </span>
                      </div>
                      {plugin.description && (
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          {plugin.description}
                        </p>
                      )}
                      {plugin.paths.length > 0 && (
                        <p className="mt-1 truncate text-[10px] text-[var(--color-muted-foreground)]">
                          Declared paths: {plugin.paths.join(", ")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Uninstall"
                      aria-label={`Uninstall ${plugin.name}`}
                      onClick={() => void handleUninstall(plugin.id)}
                      disabled={busy === plugin.id}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--color-destructive)]" />
                    </Button>
                  </div>

                  {plugin.commands.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
                      {plugin.commands.map((command) => (
                        <Button
                          key={command.id}
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRun(plugin, command)}
                          disabled={busy === `${plugin.id}:${command.id}`}
                        >
                          <Play className="h-3.5 w-3.5" />
                          {command.title}
                        </Button>
                      ))}
                    </div>
                  )}

                  {run?.pluginId === plugin.id && <CommandOutput run={run} />}
                </li>
              ))}
            </ul>
          )}
        </div>
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
                      <span
                        title={
                          entry.network ? "Declares network access" : "No network access declared"
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                          entry.network
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                        )}
                      >
                        {entry.network ? (
                          <Globe className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        {entry.network ? "network" : "no network"}
                      </span>
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

function CommandOutput({ run }: { run: CommandRun }) {
  if (run.error) {
    return (
      <pre className="mt-3 max-h-48 overflow-auto rounded border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-2 text-xs text-[var(--color-destructive)]">
        {run.error}
      </pre>
    );
  }

  if (run.rows && run.rows.length > 0) {
    const columns = Object.keys(run.rows[0]);
    return (
      <div className="mt-3 overflow-x-auto rounded border border-[var(--color-border)]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-1 font-medium capitalize">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]">
                {columns.map((c) => (
                  <td key={c} className="px-2 py-1 align-top">
                    {cellText(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="mt-3 max-h-48 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-muted)] p-2 text-xs">
      {run.raw.trim() || "(no output)"}
    </pre>
  );
}
