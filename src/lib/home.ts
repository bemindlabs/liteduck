import { invoke } from "@tauri-apps/api/core";

/** Returns the resolved `~/.LiteDuck` path. */
export const homeDir = () => invoke<string>("home_dir_path");

/**
 * Creates the `~/.LiteDuck` directory structure if it does not already exist.
 * Idempotent — safe to call on every app startup.
 */
export const homeEnsure = () => invoke<undefined>("home_ensure");

/** Reads the user profile markdown from `~/.LiteDuck/profile.md`. */
export const homeProfileRead = () => invoke<string>("home_profile_read");

/** Writes user profile markdown to `~/.LiteDuck/profile.md`. */
export const homeProfileWrite = (content: string) =>
  invoke<undefined>("home_profile_write", { content });

// ── Config types ──────────────────────────────────────────────────────────────

export interface AppearanceConfig {
  theme: string;
  font_family: string;
  font_size: number;
  sidebar_position: string;
  sidebar_collapsed: boolean;
}

export interface TerminalConfig {
  shell: string;
  env: Record<string, string>;
  scrollback: number;
}

export interface GitConfig {
  auto_fetch: boolean;
  fetch_interval_secs: number;
  sign_commits: boolean;
}

export interface TelemetryConfig {
  enabled: boolean;
  anonymous: boolean;
}

export interface Config {
  appearance: AppearanceConfig;
  terminal: TerminalConfig;
  git: GitConfig;
  telemetry: TelemetryConfig;
}

// ── Config commands ───────────────────────────────────────────────────────────

/** Reads the application config from `~/.LiteDuck/config.json`. */
export const homeConfigRead = () => invoke<Config>("home_config_read");

/** Writes the application config to `~/.LiteDuck/config.json`. */
export const homeConfigWrite = (config: Config) =>
  invoke<undefined>("home_config_write", { config });

/**
 * Resolve the effective config for the given workspace by merging:
 *   workspace `.LiteDuck/config.json` → global `~/.LiteDuck/config.json` → built-in defaults.
 *
 * `workspace` should be the absolute path to the workspace directory.
 * When omitted (or `undefined`) only the global config and built-in defaults are used.
 * A missing workspace config file is not an error.
 */
export const homeResolveConfig = (workspace?: string) =>
  invoke<Config>("home_resolve_config", { workspace: workspace ?? null });

// ── Workspace config override (LD-41) ────────────────────────────────────────

/**
 * Reads `<workspace>/.LiteDuck/config.json` as a raw JSON object.
 *
 * Returns `null` when the file does not exist (no workspace-level override
 * has been written yet). Only throws on genuine I/O or parse failures.
 *
 * The value is typed as `Record<string, unknown>` rather than `Config` because
 * workspace configs are intentionally partial — only the keys to override are
 * present. The full resolved config is obtained via `homeResolveConfig`.
 */
export const workspaceConfigRead = (workspace: string) =>
  invoke<Record<string, unknown> | null>("workspace_config_read", { workspace });

/**
 * Writes a partial config object to `<workspace>/.LiteDuck/config.json`.
 *
 * Only the keys you include will be stored; absent keys are inherited from the
 * global config and built-in defaults at resolution time. The `.LiteDuck/`
 * directory is created automatically if it does not exist.
 */
export const workspaceConfigWrite = (workspace: string, config: Record<string, unknown>) =>
  invoke<undefined>("workspace_config_write", { workspace, config });

// ── Workspace registry types ──────────────────────────────────────────────────

export interface WorkspaceEntry {
  path: string;
  name: string;
  last_opened: string;
  pinned: boolean;
  tags: string[];
}

export interface WorkspaceRegistry {
  version: number;
  active: string | null;
  workspaces: WorkspaceEntry[];
}

// ── Workspace registry commands ───────────────────────────────────────────────

/** Reads the workspace registry from `~/.LiteDuck/workspaces.json`. */
export const homeWorkspacesList = () => invoke<WorkspaceRegistry>("home_workspaces_list");

/** Writes the workspace registry to `~/.LiteDuck/workspaces.json`. */
export const homeWorkspacesUpdate = (registry: WorkspaceRegistry) =>
  invoke<undefined>("home_workspaces_update", { registry });

// ── Global memory types ───────────────────────────────────────────────────────

/** A full global memory note read from `~/.LiteDuck/memory/<slug>.md`. */
export interface HomeMemoryNote {
  slug: string;
  title: string;
  /** One of: "user" | "feedback" | "project" | "reference" */
  type: string;
  tags: string[];
  related: string[];
  created: string;
  updated: string;
  body: string;
}

/** Lightweight summary returned by list and search commands. */
export interface HomeMemoryNoteSummary {
  slug: string;
  title: string;
  type: string;
  tags: string[];
  created: string;
}

/** Payload used to create a new global memory note. */
export interface NewHomeMemoryNote {
  title: string;
  /** One of: "user" | "feedback" | "project" | "reference" */
  type: string;
  tags: string[];
  related: string[];
  body: string;
}

// ── Global memory commands ────────────────────────────────────────────────────

/** List all global memory note summaries, newest-first. */
export const homeMemoryList = () => invoke<HomeMemoryNoteSummary[]>("home_memory_list");

/** Read a single global memory note by slug. */
export const homeMemoryRead = (slug: string) =>
  invoke<HomeMemoryNote>("home_memory_read", { slug });

/**
 * Create a new global memory note.
 * Returns the generated slug.
 * Errors if a note with the same slug already exists.
 */
export const homeMemoryWrite = (note: NewHomeMemoryNote) =>
  invoke<string>("home_memory_write", { note });

/** Delete a global memory note by slug. No-op if it does not exist. */
export const homeMemoryDelete = (slug: string) => invoke<undefined>("home_memory_delete", { slug });

/** Search global memory notes by query (title, tags, type, body). */
export const homeMemorySearch = (query: string) =>
  invoke<HomeMemoryNoteSummary[]>("home_memory_search", { query });

// ── Template resolution ───────────────────────────────────────────────────────

/**
 * Metadata for a single workspace template.
 *
 * `source` is `"user"` when the file comes from
 * `~/.LiteDuck/templates/workspace/` (user override), or `"bundled"` when it
 * comes from the app's bundled resources.
 */
export interface TemplateInfo {
  name: string;
  source: "user" | "bundled";
  path: string;
}

/**
 * List all known workspace templates together with their resolved source.
 *
 * User overrides in `~/.LiteDuck/templates/workspace/` are preferred over the
 * bundled defaults and are marked with `source: "user"`.
 */
export const homeTemplatesList = () => invoke<TemplateInfo[]>("home_templates_list");

// ── Migration wizard (LD-36) ──────────────────────────────────────────────────

/**
 * Reports on the state of legacy SQLite databases and whether the migration
 * target (`~/.LiteDuck/config.json`) already exists.
 *
 * Safe to call at any time — read-only, no side effects.
 */
export interface MigrationStatus {
  settings_db_exists: boolean;
  automations_db_exists: boolean;
  mcp_db_exists: boolean;
  /** `true` when `~/.LiteDuck/config.json` already exists. */
  already_migrated: boolean;
  settings_count: number;
  automations_count: number;
  mcp_servers_count: number;
}

/** Summary returned after a completed migration run. */
export interface MigrationResult {
  settings_migrated: number;
  automations_migrated: number;
  mcp_servers_migrated: number;
  workspaces_migrated: number;
  errors: string[];
  /** Absolute paths of the archived (renamed) `.db` files. */
  archived_files: string[];
}

/**
 * Checks legacy SQLite databases and the migration target without modifying
 * anything. Returns a `MigrationStatus` describing what exists on disk.
 */
export const homeMigrationCheck = () => invoke<MigrationStatus>("home_migration_check");

/**
 * Runs the one-time migration:
 * 1. Maps known `settings.db` keys to `~/.LiteDuck/config.json`.
 * 2. Migrates `workspace_history` to `~/.LiteDuck/workspaces.json`.
 * 3. Archives (renames) `.db` files to `.db.bak.<timestamp>`.
 *
 * Returns a `MigrationResult` with counts and any non-fatal errors.
 */
export const homeMigrationRun = () => invoke<MigrationResult>("home_migration_run");
