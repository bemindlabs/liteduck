import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────
//
// Mirrors `src-tauri/src/plugins.rs`. LiteDuck plugins follow the hybrid model:
// a declarative `plugin.json` manifest + a shell command the host spawns. No
// plugin code runs in the LiteDuck process.

export interface PluginCommand {
  id: string;
  title: string;
  /** Shell command template the host spawns via `sh -c`. */
  run: string;
  /** Declared parameter keys this command accepts. */
  args: string[];
}

/**
 * A parsed `plugin.json` manifest. `kind` must be in the host allow-list
 * (`integration` | `formatter` | `linter` | `previewer` | `tool`); the loader
 * refuses `chat` / `agent` / `llm` (scope-ceiling deny-list).
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: string;
  commands: PluginCommand[];
  /** Whether the plugin declares it needs network access. */
  network: boolean;
  /** Host filesystem scopes the plugin declares it needs. */
  paths: string[];
}

/** An installed plugin: its manifest plus the resolved on-disk directory. */
export interface InstalledPlugin extends PluginManifest {
  /** Absolute path under `~/.liteduck/plugins/`. */
  dir: string;
}

/** Result of running a plugin command. */
export interface PluginRunResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

// ── API wrappers ──────────────────────────────────────────────────────────────

/** List installed plugins under `~/.liteduck/plugins/`. Lazy. */
export async function pluginList(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("plugin_list");
}

/** Install a plugin from a local folder. The id is taken from its manifest. */
export async function pluginInstall(path: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("plugin_install", { path });
}

/** Uninstall a plugin by id. */
export async function pluginUninstall(id: string): Promise<void> {
  return invoke<undefined>("plugin_uninstall", { id });
}

/** Run a plugin's contributed command with optional params. */
export async function pluginRunCommand(
  pluginId: string,
  commandId: string,
  params?: Record<string, string>,
): Promise<PluginRunResult> {
  return invoke<PluginRunResult>("plugin_run_command", {
    pluginId,
    commandId,
    params: params ?? null,
  });
}
