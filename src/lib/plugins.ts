import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────
//
// Mirrors `src-tauri/src/plugins.rs`. LiteDuck plugins follow the hybrid model:
// a declarative `plugin.json` manifest + a shell command the host spawns. No
// plugin code runs in the LiteDuck process.

/**
 * Declarative-view hint for how a command's stdout is rendered. Selects a
 * **built-in, trusted** renderer over plugin-emitted *data* — no plugin JS/HTML
 * ever executes. Unknown/absent → treated as `text` (the legacy behavior).
 */
export type PluginView = "text" | "table" | "list" | "keyvalue" | "markdown";

export interface PluginCommand {
  id: string;
  title: string;
  /** Shell command template the host spawns via `sh -c`. */
  run: string;
  /** Declared parameter keys this command accepts. */
  args: string[];
  /**
   * How to render this command's stdout. Absent or unknown → `"text"`. See
   * the output contracts per view in
   * `notes/2026-05-28_plugin-declarative-views.md`.
   */
  view?: PluginView;
  /**
   * When `true`, LiteDuck auto-runs this command as the plugin's landing view
   * when the plugin page opens. At most one command per plugin should set it.
   */
  default?: boolean;
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

/**
 * A single entry in the published plugin registry
 * (`bemindlabs/liteduck-plugins` → `registry.json`). Mirrors
 * `RegistryEntry` in `src-tauri/src/plugins.rs`.
 */
export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: string;
  /** Whether the plugin declares it needs network access. */
  network: boolean;
  author: string;
  /** Relative source path within the repo, e.g. `plugins/<id>/`. */
  source: string;
  tags: string[];
  /** Whether the registry marks this plugin as verified. */
  verified: boolean;
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

/**
 * Run a plugin's contributed command with optional params.
 *
 * `workspace` is the directory LiteDuck currently has open. When provided it
 * becomes the command's working directory (and is exported as
 * `LITEDUCK_WORKSPACE`), so workspace-scoped tools like `bwoc` resolve the open
 * workspace rather than the plugin's install dir. Pass `undefined` when no
 * workspace is open — the command then falls back to running in the plugin dir.
 */
export async function pluginRunCommand(
  pluginId: string,
  commandId: string,
  params?: Record<string, string>,
  workspace?: string,
): Promise<PluginRunResult> {
  return invoke<PluginRunResult>("plugin_run_command", {
    pluginId,
    commandId,
    params: params ?? null,
    workspace: workspace ?? null,
  });
}

/**
 * Fetch the published plugin registry. Reads `registry.json` from
 * `bemindlabs/liteduck-plugins@main` by default; pass `registryUrl` to point at
 * a fork/mirror. Read-only — nothing is written to disk.
 */
export async function pluginRegistryFetch(registryUrl?: string): Promise<RegistryEntry[]> {
  return invoke<RegistryEntry[]>("plugin_registry_fetch", {
    registryUrl: registryUrl ?? null,
  });
}

/**
 * Install a plugin straight from the GitHub registry by id. The manifest is
 * fetched + validated (scope-ceiling deny-list) before any file is written;
 * reinstalls overwrite an existing copy.
 */
export async function pluginInstallFromRegistry(
  pluginId: string,
  registryUrl?: string,
): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("plugin_install_from_registry", {
    pluginId,
    registryUrl: registryUrl ?? null,
  });
}
