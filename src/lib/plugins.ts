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
 * Workspace surface a plugin renders as:
 * - `"panel"` (default) — inside the Plugins panel master-detail list.
 * - `"page"` — full-width in the editor-area slot, like Git/Settings.
 */
export type PluginSurface = "panel" | "page";

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
  /**
   * Declarative workspace surface. Absent → `"panel"`. A `"page"` plugin opens
   * full-width in the editor-area slot (preserving open file tabs).
   */
  surface?: PluginSurface;
  /**
   * Name of a host-provided icon (lucide). The frontend resolves it to a
   * built-in component — a plugin only *names* an icon, never ships an SVG.
   * Unknown/absent → the generic plugin (Boxes) icon.
   */
  icon?: string;
  /**
   * When `true`, the plugin gets its own activity-rail icon (below the shared
   * Plugins icon) that opens its page directly. Absent → `false`. Opt-in.
   */
  pinned?: boolean;
  /**
   * Optional **executable UI** entry (ADR-002). When present, the plugin renders
   * through the isolated UI host (a sandboxed, opaque-origin iframe) using this
   * bundle instead of the built-in declarative views. Absent → declarative.
   */
  ui?: PluginUi;
}

/**
 * Executable-UI descriptor (ADR-002 / `notes/2026-05-28_plugin-ui-host-design.md`).
 * The bundle is a single self-contained ES module shipped in the plugin folder;
 * LiteDuck loads it into a sandboxed iframe with no host / Tauri access.
 */
export interface PluginUi {
  /** Bundle filename relative to the plugin dir (e.g. `ui.js`). Bare name only. */
  entry: string;
  /** Height hint for panel surfaces (`"full"` or px). Page surfaces fill the area. */
  height?: string;
  /** `"declarative"` → fall back to built-in views if the bundle fails to load. */
  fallback?: string;
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
  /** Whether the plugin ships an executable UI (ADR-002) — drives install consent. */
  ui: boolean;
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
 * Build the `plugin://` URL for a plugin's UI host document (ADR-002). The UI is
 * served from this **separate origin** (cross-origin to the host app, under its
 * own CSP) and embedded in an iframe — the host never reads/executes the bundle
 * itself. macOS/Linux use `plugin://localhost/<id>/`; Windows uses
 * `http://plugin.localhost/<id>/` (handled by Tauri's scheme mapping).
 */
export function pluginUiUrl(pluginId: string): string {
  return `plugin://localhost/${encodeURIComponent(pluginId)}/`;
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
