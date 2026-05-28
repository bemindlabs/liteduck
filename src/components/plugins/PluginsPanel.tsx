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
import { Boxes, Globe, Lock, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import {
  type InstalledPlugin,
  type PluginCommand,
  pluginInstall,
  pluginList,
  pluginRunCommand,
  pluginUninstall,
} from "@/lib/plugins";

const logger = createLogger("PluginsPanel");

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
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CommandRun | null>(null);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstall = useCallback(async () => {
    const selected = await openDialog({ directory: true, multiple: false, title: "Install plugin folder" });
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

  const handleRun = useCallback(async (plugin: InstalledPlugin, command: PluginCommand) => {
    setBusy(`${plugin.id}:${command.id}`);
    setError(null);
    try {
      const result = await pluginRunCommand(plugin.id, command.id);
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
      setRun({ pluginId: plugin.id, commandId: command.id, rows, raw: result.stdout, error: null });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-background)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-[var(--color-muted-foreground)]" />
          <h1 className="text-sm font-semibold">Plugins</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void handleInstall()} disabled={busy === "install"}>
            <Plus className="h-4 w-4" />
            Install from folder
          </Button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-4 py-2 text-xs text-[var(--color-destructive)]">
          {error}
        </div>
      )}

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
                        {plugin.network ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
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

                {run?.pluginId === plugin.id && (
                  <CommandOutput run={run} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
