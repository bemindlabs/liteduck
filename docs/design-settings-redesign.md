# Design: EPIC-10 — Settings Page Redesign

> **Status:** In Progress — SQLite deprecated, `get_settings`/`save_setting` migrated to config.json, 20 section components shipped
> **Date:** 2026-04-09
> **Scope:** Settings storage migration (SQLite → config.json), SettingsPage decomposition, useConfig() hook, and auto-save with validation
> **ADR:** [ADR-001: Single Direction](/docs/adr-001-single-direction.md)
> **Stories:** LD-42, LD-43, LD-44, LD-45
> **Depends on:** EPIC-8 (LD-28, LD-35) — `~/.LiteDuck/config.json` must exist before this epic ships

---

## 1. Motivation

LiteDuck's current settings system has three problems that block the broader architecture:

**1. Wrong storage layer.** Settings live in `settings.db` (SQLite key-value pairs via `getSetting` / `saveSetting`). ADR-001 P1 mandates that all persistent user data is stored as JSON files. `settings.db` is explicitly deprecated and must not survive EPIC-10.

**2. Monolithic page.** `SettingsPage.tsx` is 3,332 lines — one file containing every section's state, effects, handlers, and JSX. No section can be tested, reviewed, or AI-modified in isolation. Any change to one section risks regressions in all others.

**3. Flat untyped map.** `Record<string, string>` carries no type information. A typo in a key, a number stored as a string, or a missing required field fails silently at runtime rather than at the TypeScript compiler.

EPIC-10 replaces all three with a structured `Config` type, a typed `useConfig()` hook, twenty focused section components (expanded from the original twelve), and auto-save with inline validation.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SettingsPage (shell)                            │
│  ─ Sidebar nav (20 sections)                                            │
│  ─ Mounts exactly one <*Section /> at a time                            │
│  ─ Passes { config, update, errors } from useConfig() to active section│
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ useConfig()
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          useConfig() hook                               │
│  ─ Calls resolve_config(workspace) on mount                             │
│  ─ Debounces writes (1 s) → save_config(scope, patch)                  │
│  ─ Subscribes to config-changed Tauri event                             │
│  ─ Runs field-level validators → exposes ValidationErrors               │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ Tauri IPC
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Rust: config.rs                                    │
│  ─ resolve_config(workspace) → merges workspace + global + default      │
│  ─ save_config(scope, patch) → writes to the correct layer              │
│  ─ Emits config-changed on every write                                  │
│  ─ Secrets: values matching ${keychain:*} round-trip through keychain  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ File system
                ┌──────────────┴───────────────┐
                ▼                              ▼
  <workspace>/.LiteDuck/config.json    ~/.LiteDuck/config.json
  (workspace overrides)                (global defaults)
```

**Read chain** (ADR-001 Conflict 2 — single path, no SQLite):

```
resolve_config(workspace):
  1. <workspace>/.LiteDuck/config.json   (workspace layer)
  2. ~/.LiteDuck/config.json             (global layer)
  3. Built-in Rust Default impl          (hardcoded fallback)

  Secrets (values starting with ${keychain:}):
  4. OS keychain                         (resolved transparently at read time)
```

**Write chain:**

```
save_config(scope, patch):
  scope == "workspace" → write to <workspace>/.LiteDuck/config.json
  scope == "global"    → write to ~/.LiteDuck/config.json

  For secret fields: write keychain reference to JSON, store value in keychain.
  Emit config-changed { scope, keys_changed } after every write.
```

---

## 3. Config Struct (Rust)

File: `src-tauri/src/config.rs` (new module, replaces settings-related code in `settings.rs`)

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Root configuration type. All fields are Optional so individual layers can
/// provide only the keys they override — the merge step fills the rest from
/// lower-priority layers or built-in defaults.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance: Option<AppearanceConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai: Option<AiConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal: Option<TerminalConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<GitConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents: Option<AgentsConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<NetworkConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub integrations: Option<IntegrationsConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub telemetry: Option<TelemetryConfig>,
}

// ── Section structs ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub theme: String,                    // "dark" | "light" | "system"
    pub font_family: String,              // "JetBrains Mono"
    pub font_size: u8,                    // 10–24
    pub sidebar_position: String,         // "left" | "right"
    pub sidebar_collapsed: bool,
    pub density: String,                  // "comfortable" | "compact"
    pub show_line_numbers: bool,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            font_family: "JetBrains Mono".into(),
            font_size: 14,
            sidebar_position: "left".into(),
            sidebar_collapsed: false,
            density: "comfortable".into(),
            show_line_numbers: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub default_model: String,
    pub gateway_url: String,
    /// Value is "${keychain:openclaw_token}" — resolved at read time.
    pub gateway_token: Option<String>,
    pub streaming: bool,
    pub temperature: f32,                 // 0.0–2.0
    pub max_tokens: u32,
    pub providers: Vec<LlmProvider>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            default_model: "claude-sonnet-4-6".into(),
            gateway_url: "http://localhost:3000".into(),
            gateway_token: None,
            streaming: true,
            temperature: 0.7,
            max_tokens: 4096,
            providers: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProvider {
    pub id: String,                       // "anthropic" | "openai" | "custom"
    pub name: String,
    pub base_url: String,
    /// "${keychain:provider_<id>_key}" — never a raw value in JSON.
    pub api_key_ref: Option<String>,
    pub default_model: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub shell: String,                    // "/bin/zsh"
    pub env: HashMap<String, String>,
    pub scrollback: u32,
    pub font_family: Option<String>,      // overrides appearance.font_family for terminal
    pub font_size: Option<u8>,
    pub cursor_style: String,             // "block" | "underline" | "bar"
    pub copy_on_select: bool,
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            shell: "/bin/zsh".into(),
            env: HashMap::new(),
            scrollback: 10_000,
            font_family: None,
            font_size: None,
            cursor_style: "block".into(),
            copy_on_select: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitConfig {
    pub auto_fetch: bool,
    pub fetch_interval_secs: u32,
    pub sign_commits: bool,
    pub gpg_key_id: Option<String>,
    pub default_branch: String,
    pub clone_parent_dir: Option<String>,
    pub push_on_commit: bool,
}

impl Default for GitConfig {
    fn default() -> Self {
        Self {
            auto_fetch: true,
            fetch_interval_secs: 300,
            sign_commits: false,
            gpg_key_id: None,
            default_branch: "main".into(),
            clone_parent_dir: None,
            push_on_commit: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsConfig {
    pub max_concurrent: u8,               // 1–10
    pub default_model: String,
    pub auto_collect_memory: bool,
    pub a2a_discovery: bool,
    pub a2a_port: u16,                    // default 41000
    pub gates: AgentGatesConfig,
    pub workspace_groups: Vec<WorkspaceGroup>,
}

impl Default for AgentsConfig {
    fn default() -> Self {
        Self {
            max_concurrent: 3,
            default_model: "claude-sonnet-4-6".into(),
            auto_collect_memory: true,
            a2a_discovery: true,
            a2a_port: 41000,
            gates: AgentGatesConfig::default(),
            workspace_groups: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentGatesConfig {
    pub require_approval_for_file_writes: bool,
    pub require_approval_for_git_push: bool,
    pub require_approval_for_config_changes: bool,
    pub auto_approve_low_risk: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceGroup {
    pub id: String,
    pub name: String,
    pub workspace_paths: Vec<String>,
    pub shared_memory: bool,
    pub shared_agents: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub lan_chat_enabled: bool,
    pub lan_display_name: Option<String>,
    pub ble_enabled: bool,
    pub mesh_enabled: bool,
    pub proxy_url: Option<String>,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            lan_chat_enabled: true,
            lan_display_name: None,
            ble_enabled: false,
            mesh_enabled: false,
            proxy_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationsConfig {
    pub github: GithubIntegration,
    pub jira: JiraIntegration,
    pub telegram: TelegramIntegration,
    pub docker: DockerIntegration,
    pub mcp_servers: Vec<String>,         // slugs of enabled MCP servers
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GithubIntegration {
    /// "${keychain:github_token}" — never a raw value.
    pub token_ref: Option<String>,
    pub default_org: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JiraIntegration {
    pub base_url: Option<String>,
    pub email: Option<String>,
    /// "${keychain:jira_token}"
    pub token_ref: Option<String>,
    pub project_key: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TelegramIntegration {
    /// "${keychain:telegram_bot_token}"
    pub bot_token_ref: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DockerIntegration {
    pub socket_path: Option<String>,      // e.g. "/var/run/docker.sock"
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryConfig {
    pub enabled: bool,
    pub anonymous: bool,
    pub crash_reports: bool,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            anonymous: true,
            crash_reports: false,
        }
    }
}

/// The fully resolved Config with all layers merged and all keychain
/// references expanded into their real values. Used as the IPC return type.
/// Secret fields that the frontend should not receive plain are marked with
/// `is_secret: true` in the companion `ConfigMeta` type (TypeScript-side).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedConfig {
    pub config: Config,
    /// Which layer each top-level key came from.
    pub source: HashMap<String, ConfigLayer>,
    /// Names of all keys that are secret (fetched from keychain).
    pub secret_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigLayer {
    Workspace,
    Global,
    Default,
}

/// Scope for write operations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigScope {
    Workspace,
    Global,
}
```

---

## 4. `resolve_config()` — Read Chain Implementation

File: `src-tauri/src/config.rs` (continued)

```rust
use std::path::{Path, PathBuf};
use std::fs;

/// Resolves the full configuration for a given workspace by merging three layers.
/// Returns a ResolvedConfig that includes provenance information (which layer each
/// key came from) and a list of secret key names.
///
/// # Errors
/// Returns Err only for I/O errors on the config files that exist but cannot be
/// read. Missing files are treated as empty layers, not errors.
#[tauri::command]
pub async fn resolve_config(workspace: Option<String>) -> Result<ResolvedConfig, String> {
    // Layer 3 (lowest priority): built-in defaults
    let default_config = build_default_config();
    let mut source: HashMap<String, ConfigLayer> = HashMap::new();

    // Layer 2: global config at ~/.LiteDuck/config.json
    let global_path = global_config_path();
    let global_config = read_config_file(&global_path)
        .map_err(|e| format!("Cannot read global config {}: {e}", global_path.display()))?;

    // Layer 1 (highest priority): workspace config at <ws>/.LiteDuck/config.json
    let workspace_config = if let Some(ws) = &workspace {
        let ws_path = PathBuf::from(ws).join(".LiteDuck").join("config.json");
        read_config_file(&ws_path)
            .map_err(|e| format!("Cannot read workspace config {}: {e}", ws_path.display()))?
    } else {
        None
    };

    // Merge: workspace overrides global overrides default
    let merged = merge_configs(
        default_config,
        global_config.as_ref(),
        workspace_config.as_ref(),
        &mut source,
    );

    // Resolve keychain references
    let (resolved, secret_keys) = resolve_secrets(merged).await?;

    Ok(ResolvedConfig {
        config: resolved,
        source,
        secret_keys,
    })
}

/// Reads a config.json file. Returns None when the file does not exist (treated
/// as an empty layer). Returns Err for files that exist but cannot be parsed.
fn read_config_file(path: &Path) -> Result<Option<Config>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("read error: {e}"))?;
    let config: Config = serde_json::from_str(&raw)
        .map_err(|e| format!("parse error in {}: {e}", path.display()))?;
    Ok(Some(config))
}

/// Returns the path to ~/.LiteDuck/config.json.
pub fn global_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("home dir must be known")
        .join(".LiteDuck")
        .join("config.json")
}

/// Builds the built-in default config from the Default impls.
fn build_default_config() -> Config {
    Config {
        appearance: Some(AppearanceConfig::default()),
        ai: Some(AiConfig::default()),
        terminal: Some(TerminalConfig::default()),
        git: Some(GitConfig::default()),
        agents: Some(AgentsConfig::default()),
        network: Some(NetworkConfig::default()),
        integrations: Some(IntegrationsConfig::default()),
        telemetry: Some(TelemetryConfig::default()),
    }
}

/// Field-level merge: workspace > global > default.
/// Each section is taken entirely from the highest-priority layer that
/// provides it. Fine-grained field merging within a section is not needed
/// because sections are small and the workspace layer is workspace-scoped.
fn merge_configs(
    default: Config,
    global: Option<&Config>,
    workspace: Option<&Config>,
    source: &mut HashMap<String, ConfigLayer>,
) -> Config {
    macro_rules! pick_section {
        ($field:ident) => {{
            let key = stringify!($field);
            if workspace.and_then(|c| c.$field.as_ref()).is_some() {
                source.insert(key.into(), ConfigLayer::Workspace);
                workspace.unwrap().$field.clone()
            } else if global.and_then(|c| c.$field.as_ref()).is_some() {
                source.insert(key.into(), ConfigLayer::Global);
                global.unwrap().$field.clone()
            } else {
                source.insert(key.into(), ConfigLayer::Default);
                default.$field.clone()
            }
        }};
    }

    Config {
        appearance: pick_section!(appearance),
        ai: pick_section!(ai),
        terminal: pick_section!(terminal),
        git: pick_section!(git),
        agents: pick_section!(agents),
        network: pick_section!(network),
        integrations: pick_section!(integrations),
        telemetry: pick_section!(telemetry),
    }
}

/// Walks the merged config, resolves "${keychain:<key>}" references to their
/// actual keychain values, and returns the resolved config plus the list of
/// field paths that were secrets.
async fn resolve_secrets(mut config: Config) -> Result<(Config, Vec<String>), String> {
    let mut secret_keys = Vec::new();
    // Resolution helpers per section that contains secret refs.
    if let Some(ai) = config.ai.as_mut() {
        if let Some(ref token_ref) = ai.gateway_token.clone() {
            if let Some(key) = parse_keychain_ref(token_ref) {
                secret_keys.push("ai.gateway_token".into());
                ai.gateway_token = resolve_keychain_ref(&key).await?;
            }
        }
    }
    if let Some(integ) = config.integrations.as_mut() {
        if let Some(ref r) = integ.github.token_ref.clone() {
            if let Some(key) = parse_keychain_ref(r) {
                secret_keys.push("integrations.github.token_ref".into());
                integ.github.token_ref = resolve_keychain_ref(&key).await?;
            }
        }
        if let Some(ref r) = integ.jira.token_ref.clone() {
            if let Some(key) = parse_keychain_ref(r) {
                secret_keys.push("integrations.jira.token_ref".into());
                integ.jira.token_ref = resolve_keychain_ref(&key).await?;
            }
        }
        if let Some(ref r) = integ.telegram.bot_token_ref.clone() {
            if let Some(key) = parse_keychain_ref(r) {
                secret_keys.push("integrations.telegram.bot_token_ref".into());
                integ.telegram.bot_token_ref = resolve_keychain_ref(&key).await?;
            }
        }
    }
    Ok((config, secret_keys))
}

/// Parses "${keychain:some_key}" and returns "some_key", or None.
fn parse_keychain_ref(value: &str) -> Option<String> {
    value
        .strip_prefix("${keychain:")
        .and_then(|s| s.strip_suffix('}'))
        .map(|k| k.to_owned())
}

/// Fetches a single secret from the OS keychain on a blocking thread.
/// Returns None when the key is absent.
async fn resolve_keychain_ref(key: &str) -> Result<Option<String>, String> {
    let key = key.to_owned();
    tokio::task::spawn_blocking(move || crate::keychain::get_secret(&key))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
}
```

### `save_config` — Write Command

```rust
/// Persists a partial config patch to the specified scope layer.
/// `patch` is a JSON object containing only the keys to change (deep merge
/// into the existing file, section by section).
/// Secret values in the patch are stored in the OS keychain; the JSON file
/// receives the "${keychain:<key>}" reference instead.
/// Emits "config-changed" Tauri event after a successful write.
#[tauri::command]
pub async fn save_config(
    app: tauri::AppHandle,
    scope: ConfigScope,
    workspace: Option<String>,
    patch: serde_json::Value,
) -> Result<(), String> {
    let path = match scope {
        ConfigScope::Global => global_config_path(),
        ConfigScope::Workspace => {
            let ws = workspace.ok_or("workspace path required for workspace scope")?;
            PathBuf::from(ws).join(".LiteDuck").join("config.json")
        }
    };

    // Read existing layer (or empty object).
    let existing_raw = if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        "{}".into()
    };
    let mut existing: serde_json::Value =
        serde_json::from_str(&existing_raw).map_err(|e| e.to_string())?;

    // Extract any secrets from the patch before writing.
    let (clean_patch, secrets) = extract_secrets(patch)?;

    // Store secrets in keychain with canonical key names.
    for (key, value) in secrets {
        let k = key.clone();
        tokio::task::spawn_blocking(move || crate::keychain::store_secret(&k, &value))
            .await
            .map_err(|e| format!("spawn_blocking: {e}"))??;
    }

    // Deep-merge clean patch into existing layer.
    json_merge(&mut existing, &clean_patch);

    // Write back.
    let parent = path.parent().ok_or("invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let serialized = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())?;

    // Emit change event so all listeners (other pages, AI agents) update.
    app.emit(
        "config-changed",
        serde_json::json!({ "scope": scope, "path": path }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
```

---

## 5. TypeScript Types

File: `src/lib/config.ts` (new file, replaces `src/lib/settings.ts` for structured access)

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Config type mirror of the Rust structs ────────────────────────────────────

export interface AppearanceConfig {
  theme: "dark" | "light" | "system";
  font_family: string;
  font_size: number;
  sidebar_position: "left" | "right";
  sidebar_collapsed: boolean;
  density: "comfortable" | "compact";
  show_line_numbers: boolean;
}

export interface LlmProvider {
  id: string;
  name: string;
  base_url: string;
  api_key_ref?: string;       // "${keychain:*}" reference or resolved value
  default_model?: string;
  enabled: boolean;
}

export interface AiConfig {
  default_model: string;
  gateway_url: string;
  gateway_token?: string;     // resolved from keychain; null when absent
  streaming: boolean;
  temperature: number;
  max_tokens: number;
  providers: LlmProvider[];
}

export interface TerminalConfig {
  shell: string;
  env: Record<string, string>;
  scrollback: number;
  font_family?: string;
  font_size?: number;
  cursor_style: "block" | "underline" | "bar";
  copy_on_select: boolean;
}

export interface GitConfig {
  auto_fetch: boolean;
  fetch_interval_secs: number;
  sign_commits: boolean;
  gpg_key_id?: string;
  default_branch: string;
  clone_parent_dir?: string;
  push_on_commit: boolean;
}

export interface AgentGatesConfig {
  require_approval_for_file_writes: boolean;
  require_approval_for_git_push: boolean;
  require_approval_for_config_changes: boolean;
  auto_approve_low_risk: boolean;
}

export interface WorkspaceGroup {
  id: string;
  name: string;
  workspace_paths: string[];
  shared_memory: boolean;
  shared_agents: boolean;
}

export interface AgentsConfig {
  max_concurrent: number;
  default_model: string;
  auto_collect_memory: boolean;
  a2a_discovery: boolean;
  a2a_port: number;
  gates: AgentGatesConfig;
  workspace_groups: WorkspaceGroup[];
}

export interface NetworkConfig {
  lan_chat_enabled: boolean;
  lan_display_name?: string;
  ble_enabled: boolean;
  mesh_enabled: boolean;
  proxy_url?: string;
}

export interface GithubIntegration {
  token_ref?: string;
  default_org?: string;
}

export interface JiraIntegration {
  base_url?: string;
  email?: string;
  token_ref?: string;
  project_key?: string;
  enabled: boolean;
}

export interface TelegramIntegration {
  bot_token_ref?: string;
  enabled: boolean;
}

export interface DockerIntegration {
  socket_path?: string;
  enabled: boolean;
}

export interface IntegrationsConfig {
  github: GithubIntegration;
  jira: JiraIntegration;
  telegram: TelegramIntegration;
  docker: DockerIntegration;
  mcp_servers: string[];
}

export interface TelemetryConfig {
  enabled: boolean;
  anonymous: boolean;
  crash_reports: boolean;
}

export interface Config {
  appearance: AppearanceConfig;
  ai: AiConfig;
  terminal: TerminalConfig;
  git: GitConfig;
  agents: AgentsConfig;
  network: NetworkConfig;
  integrations: IntegrationsConfig;
  telemetry: TelemetryConfig;
}

export type ConfigLayer = "workspace" | "global" | "default";
export type ConfigScope = "workspace" | "global";

export interface ResolvedConfig {
  config: Config;
  source: Partial<Record<keyof Config, ConfigLayer>>;
  secret_keys: string[];
}

// ── Deep-partial type for patches ─────────────────────────────────────────────

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export type ConfigPatch = DeepPartial<Config>;

// ── Config-changed event payload ──────────────────────────────────────────────

export interface ConfigChangedPayload {
  scope: ConfigScope;
  path: string;
}

// ── Tauri IPC wrappers ────────────────────────────────────────────────────────

export async function resolveConfig(workspace?: string): Promise<ResolvedConfig> {
  return invoke<ResolvedConfig>("resolve_config", { workspace });
}

export async function saveConfig(
  scope: ConfigScope,
  patch: ConfigPatch,
  workspace?: string,
): Promise<void> {
  return invoke<void>("save_config", { scope, workspace, patch });
}

export function onConfigChanged(
  handler: (payload: ConfigChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<ConfigChangedPayload>("config-changed", (e) => handler(e.payload));
}
```

---

## 6. `useConfig()` Hook

File: `src/hooks/useConfig.ts` (new)

The hook is the single interface between the React tree and the config system. No component touches `invoke` directly for config operations.

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import {
  resolveConfig,
  saveConfig,
  onConfigChanged,
  type Config,
  type ConfigPatch,
  type ConfigScope,
  type ResolvedConfig,
} from "@/lib/config";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationErrors = Partial<Record<string, string>>;

function validate(config: Config): ValidationErrors {
  const errors: ValidationErrors = {};

  // Appearance
  if (config.appearance.font_size < 10 || config.appearance.font_size > 24) {
    errors["appearance.font_size"] = "Font size must be between 10 and 24.";
  }

  // AI
  const gatewayUrl = config.ai.gateway_url;
  if (gatewayUrl && !/^https?:\/\/.+/.test(gatewayUrl)) {
    errors["ai.gateway_url"] = "Must be a valid http:// or https:// URL.";
  }
  if (config.ai.temperature < 0 || config.ai.temperature > 2) {
    errors["ai.temperature"] = "Temperature must be between 0 and 2.";
  }
  if (config.ai.max_tokens < 256 || config.ai.max_tokens > 128_000) {
    errors["ai.max_tokens"] = "Max tokens must be between 256 and 128,000.";
  }

  // Terminal
  if (!config.terminal.shell || config.terminal.shell.trim() === "") {
    errors["terminal.shell"] = "Shell path is required.";
  }

  // Agents
  if (config.agents.max_concurrent < 1 || config.agents.max_concurrent > 10) {
    errors["agents.max_concurrent"] = "Concurrent agents must be between 1 and 10.";
  }
  if (config.agents.a2a_port < 1024 || config.agents.a2a_port > 65535) {
    errors["agents.a2a_port"] = "A2A port must be between 1024 and 65535.";
  }

  // Network
  const proxyUrl = config.network.proxy_url;
  if (proxyUrl && !/^https?:\/\/.+/.test(proxyUrl)) {
    errors["network.proxy_url"] = "Proxy URL must be a valid http:// or https:// URL.";
  }

  // Integrations — Jira
  const jiraUrl = config.integrations.jira.base_url;
  if (jiraUrl && !/^https?:\/\/.+/.test(jiraUrl)) {
    errors["integrations.jira.base_url"] = "Jira URL must be a valid http:// or https:// URL.";
  }

  return errors;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseConfigReturn {
  /** The fully resolved, merged config. Null while loading. */
  config: Config | null;
  /** Which layer each top-level key was sourced from. */
  source: ResolvedConfig["source"];
  /** Field-path-keyed validation errors. Empty object means no errors. */
  errors: ValidationErrors;
  /** True during the initial load and after a config-changed event triggers reload. */
  loading: boolean;
  /** Most recent load error, if any. */
  loadError: string | null;
  /** True while a debounced save is pending. */
  saving: boolean;
  /**
   * Merges `patch` into local state immediately (optimistic) and schedules a
   * debounced write to the config file. Validates after merge.
   */
  update: (patch: ConfigPatch, scope?: ConfigScope) => void;
  /** Forces an immediate save bypassing the debounce. */
  flush: () => Promise<void>;
  /** Reloads config from disk, discarding any pending debounced changes. */
  reload: () => Promise<void>;
}

const DEBOUNCE_MS = 1000;

export function useConfig(): UseConfigReturn {
  const { workspace } = useWorkspace();
  const [resolved, setResolved] = useState<ResolvedConfig | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pending patch buffer and scope for the debounce flush.
  const pendingPatch = useRef<ConfigPatch>({});
  const pendingScope = useRef<ConfigScope>("global");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag to prevent re-entrant reloads triggered by our own save events.
  const isSelfEmit = useRef(false);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await resolveConfig(workspace ?? undefined);
      setResolved(result);
      setErrors(validate(result.config));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Subscribe to config-changed events ─────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onConfigChanged((_payload) => {
      // Skip events that we emitted ourselves (already have the optimistic state).
      if (isSelfEmit.current) {
        isSelfEmit.current = false;
        return;
      }
      load();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [load]);

  // ── Flush pending patch to disk ─────────────────────────────────────────────

  const flushPatch = useCallback(async () => {
    const patch = pendingPatch.current;
    const scope = pendingScope.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatch.current = {};
    setSaving(true);
    isSelfEmit.current = true;
    try {
      await saveConfig(scope, patch, workspace ?? undefined);
    } finally {
      setSaving(false);
    }
  }, [workspace]);

  // ── Update ──────────────────────────────────────────────────────────────────

  const update = useCallback(
    (patch: ConfigPatch, scope: ConfigScope = "global") => {
      // Optimistic local state merge.
      setResolved((prev) => {
        if (!prev) return prev;
        const next = deepMerge(prev.config, patch) as Config;
        setErrors(validate(next));
        return { ...prev, config: next };
      });

      // Accumulate patch and reset debounce timer.
      pendingPatch.current = deepMerge(pendingPatch.current, patch) as ConfigPatch;
      pendingScope.current = scope;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushPatch();
      }, DEBOUNCE_MS);
    },
    [flushPatch],
  );

  // Flush on unmount so no changes are lost.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        flushPatch();
      }
    };
  }, [flushPatch]);

  return {
    config: resolved?.config ?? null,
    source: resolved?.source ?? {},
    errors,
    loading,
    loadError,
    saving,
    update,
    flush: flushPatch,
    reload: load,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepMerge<T extends object>(target: T, patch: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchVal = patch[key];
    const targetVal = result[key];
    if (
      patchVal !== null &&
      typeof patchVal === "object" &&
      !Array.isArray(patchVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as object, patchVal as object) as T[keyof T];
    } else if (patchVal !== undefined) {
      result[key] = patchVal as T[keyof T];
    }
  }
  return result;
}
```

---

## 7. Component Structure

### 7.1 File Layout

```
src/pages/settings/
├── SettingsPage.tsx              # Shell: sidebar nav + section router (~120 lines)
├── sections/
│   ├── AppearanceSection.tsx     # Theme, font, density           (~180 lines)
│   ├── AiSection.tsx             # Gateway, model, temperature     (~220 lines)
│   ├── LlmProvidersSection.tsx   # Provider list CRUD              (~260 lines)
│   ├── TerminalSection.tsx       # Shell, env vars, cursor         (~200 lines)
│   ├── GitSection.tsx            # Auto-fetch, signing, GPG        (~180 lines)
│   ├── AgentsSection.tsx         # Concurrency, A2A, gates         (~240 lines)
│   ├── WorkspaceGroupsSection.tsx# Group list CRUD                 (~220 lines)
│   ├── NetworkSection.tsx        # LAN, BLE, mesh, proxy           (~160 lines)
│   ├── IntegrationsSection.tsx   # GitHub, Jira, Telegram, Docker  (~280 lines)
│   ├── McpSection.tsx            # MCP server list (read-only here)(<200 lines)
│   ├── TelemetrySection.tsx      # Opt-in toggles                  (~120 lines)
│   └── AboutSection.tsx          # Version, updates, diagnostics   (~160 lines)
├── components/
│   ├── SettingField.tsx          # Labeled input with inline error  (~80 lines)
│   ├── SettingToggle.tsx         # Labeled boolean toggle           (~60 lines)
│   ├── SettingSelect.tsx         # Labeled select                   (~70 lines)
│   ├── SettingSecret.tsx         # Password input + show/hide       (~90 lines)
│   ├── ScopeIndicator.tsx        # "workspace" | "global" badge     (~50 lines)
│   └── SectionHeader.tsx        # Section title + description       (~50 lines)
└── index.ts                      # Re-exports SettingsPage
```

### 7.2 SettingsPage Shell

```typescript
// src/pages/settings/SettingsPage.tsx
import { useState } from "react";
import {
  Palette, Cpu, TerminalIcon, GitBranch, Bot, Globe,
  Plug, Network, Zap, Info, Layers, Settings2,
} from "lucide-react";
import { useConfig } from "@/hooks/useConfig";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AiSection } from "./sections/AiSection";
import { LlmProvidersSection } from "./sections/LlmProvidersSection";
import { TerminalSection } from "./sections/TerminalSection";
import { GitSection } from "./sections/GitSection";
import { AgentsSection } from "./sections/AgentsSection";
import { WorkspaceGroupsSection } from "./sections/WorkspaceGroupsSection";
import { NetworkSection } from "./sections/NetworkSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { McpSection } from "./sections/McpSection";
import { TelemetrySection } from "./sections/TelemetrySection";
import { AboutSection } from "./sections/AboutSection";
import { PageLoading } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "appearance",       label: "Appearance",        icon: Palette },
  { id: "ai",               label: "AI",                icon: Cpu },
  { id: "llm-providers",    label: "LLM Providers",     icon: Layers },
  { id: "terminal",         label: "Terminal",          icon: TerminalIcon },
  { id: "git",              label: "Git",               icon: GitBranch },
  { id: "agents",           label: "Agents",            icon: Bot },
  { id: "workspace-groups", label: "Workspace Groups",  icon: Settings2 },
  { id: "network",          label: "Network",           icon: Network },
  { id: "integrations",     label: "Integrations",      icon: Plug },
  { id: "mcp",              label: "MCP Servers",       icon: Globe },
  { id: "telemetry",        label: "Telemetry",         icon: Zap },
  { id: "about",            label: "About",             icon: Info },
];

const SECTION_MAP: Record<string, React.ComponentType<SectionProps>> = {
  "appearance":       AppearanceSection,
  "ai":               AiSection,
  "llm-providers":    LlmProvidersSection,
  "terminal":         TerminalSection,
  "git":              GitSection,
  "agents":           AgentsSection,
  "workspace-groups": WorkspaceGroupsSection,
  "network":          NetworkSection,
  "integrations":     IntegrationsSection,
  "mcp":              McpSection,
  "telemetry":        TelemetrySection,
  "about":            AboutSection,
};

export interface SectionProps {
  config: import("@/lib/config").Config;
  source: import("@/lib/config").ResolvedConfig["source"];
  errors: import("@/hooks/useConfig").ValidationErrors;
  saving: boolean;
  update: import("@/hooks/useConfig").UseConfigReturn["update"];
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("appearance");
  const { config, source, errors, loading, loadError, saving, update } = useConfig();

  if (loading) return <PageLoading />;
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-destructive)]">
        Failed to load settings: {loadError}
      </div>
    );
  }
  if (!config) return null;

  const ActiveSection = SECTION_MAP[activeSection];
  const sectionErrors = Object.fromEntries(
    Object.entries(errors).filter(([k]) => k.startsWith(activeSection)),
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <nav className="w-52 shrink-0 border-r border-[var(--color-border)] overflow-y-auto py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const hasError = Object.keys(errors).some((k) => k.startsWith(item.id));
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors",
                activeSection === item.id
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {hasError && (
                <span className="h-2 w-2 rounded-full bg-[var(--color-destructive)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {saving && (
          <div className="fixed top-4 right-4 flex items-center gap-2 rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)]">
            <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]" />
            Saving...
          </div>
        )}
        <ActiveSection
          config={config}
          source={source}
          errors={sectionErrors}
          saving={saving}
          update={update}
        />
      </main>
    </div>
  );
}
```

### 7.3 Representative Section: `AiSection`

Shows the pattern all sections follow — typed props, SettingField/SettingSecret components, no local save state.

```typescript
// src/pages/settings/sections/AiSection.tsx
import { SectionHeader } from "../components/SectionHeader";
import { SettingField } from "../components/SettingField";
import { SettingSecret } from "../components/SettingSecret";
import { SettingSelect } from "../components/SettingSelect";
import { ScopeIndicator } from "../components/ScopeIndicator";
import { Button } from "@/components/ui/button";
import { openclawCheckConnection } from "@/lib/openclaw";
import { useState } from "react";
import type { SectionProps } from "../SettingsPage";

const MODEL_OPTIONS = [
  { value: "claude-opus-4-5",    label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5",   label: "Claude Haiku 4.5" },
  { value: "gpt-4o",             label: "GPT-4o" },
  { value: "gpt-4o-mini",        label: "GPT-4o Mini" },
  { value: "gemini-2.0-flash",   label: "Gemini 2.0 Flash" },
];

export function AiSection({ config, source, errors, update }: SectionProps) {
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "checking" | "ok" | "error"
  >("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const ai = config.ai;
  const scope = source.ai ?? "default";

  async function testConnection() {
    setConnectionStatus("checking");
    setConnectionError(null);
    try {
      await openclawCheckConnection();
      setConnectionStatus("ok");
    } catch (e) {
      setConnectionStatus("error");
      setConnectionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader
        title="AI"
        description="OpenClaw gateway connection and default model settings."
        badge={<ScopeIndicator scope={scope} />}
      />

      <div className="space-y-6">
        <SettingField
          label="Gateway URL"
          helpText="Base URL only — no trailing /v1 or /api."
          error={errors["ai.gateway_url"]}
          value={ai.gateway_url}
          onChange={(v) => update({ ai: { gateway_url: v } })}
          placeholder="http://localhost:3000"
        />

        <SettingSecret
          label="Gateway Token"
          helpText="Stored in the OS keychain. Required for authenticated gateways."
          error={errors["ai.gateway_token"]}
          value={ai.gateway_token ?? ""}
          onChange={(v) => update({ ai: { gateway_token: v || undefined } })}
          placeholder="sk-..."
        />

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={testConnection}
            disabled={connectionStatus === "checking"}
          >
            {connectionStatus === "checking" ? "Checking..." : "Test Connection"}
          </Button>
          {connectionStatus === "ok" && (
            <span className="text-sm text-green-500">Connected</span>
          )}
          {connectionStatus === "error" && (
            <span className="text-sm text-[var(--color-destructive)]">
              {connectionError}
            </span>
          )}
        </div>

        <SettingSelect
          label="Default Model"
          helpText="Used when no model is specified in a chat or agent session."
          value={ai.default_model}
          options={MODEL_OPTIONS}
          onChange={(v) => update({ ai: { default_model: v } })}
        />

        <SettingField
          label="Temperature"
          helpText="Sampling temperature from 0 (deterministic) to 2 (creative)."
          error={errors["ai.temperature"]}
          value={String(ai.temperature)}
          onChange={(v) => update({ ai: { temperature: parseFloat(v) || 0 } })}
          type="number"
          min={0}
          max={2}
          step={0.1}
        />

        <SettingField
          label="Max Tokens"
          helpText="Maximum tokens per response. Range: 256–128,000."
          error={errors["ai.max_tokens"]}
          value={String(ai.max_tokens)}
          onChange={(v) => update({ ai: { max_tokens: parseInt(v, 10) || 4096 } })}
          type="number"
          min={256}
          max={128000}
          step={256}
        />
      </div>
    </div>
  );
}
```

### 7.4 Shared Field Components

```typescript
// src/pages/settings/components/SettingField.tsx
interface SettingFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  error?: string;
  type?: "text" | "number" | "url";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  browseFolder?: () => void;   // activates folder picker button
}

export function SettingField({
  label, value, onChange, placeholder, helpText, error, type = "text",
  min, max, step, disabled, browseFolder,
}: SettingFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-md border px-3 py-2 text-sm bg-[var(--color-background)]",
            "placeholder:text-[var(--color-muted-foreground)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
            error
              ? "border-[var(--color-destructive)] focus:ring-[var(--color-destructive)]"
              : "border-[var(--color-border)]",
          )}
        />
        {browseFolder && (
          <Button variant="secondary" size="sm" onClick={browseFolder} type="button">
            Browse
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-[var(--color-destructive)]">{error}</p>
      )}
      {helpText && !error && (
        <p className="text-xs text-[var(--color-muted-foreground)]">{helpText}</p>
      )}
    </div>
  );
}
```

```typescript
// src/pages/settings/components/ScopeIndicator.tsx
import type { ConfigLayer } from "@/lib/config";
import { cn } from "@/lib/utils";

interface ScopeIndicatorProps {
  scope: ConfigLayer;
}

const SCOPE_STYLES: Record<ConfigLayer, string> = {
  workspace: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  global:    "bg-amber-500/10 text-amber-500 border-amber-500/20",
  default:   "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border-[var(--color-border)]",
};

const SCOPE_LABELS: Record<ConfigLayer, string> = {
  workspace: "workspace",
  global:    "global",
  default:   "built-in default",
};

export function ScopeIndicator({ scope }: ScopeIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
        SCOPE_STYLES[scope],
      )}
    >
      {SCOPE_LABELS[scope]}
    </span>
  );
}
```

---

## 8. Auto-Save & Debounce

The 1-second debounce is implemented entirely inside `useConfig()` (see Section 6). No section component manages a save timer.

**Invariants:**

| Situation | Behavior |
|-----------|----------|
| User types into a field | `update()` called on each change; local state updates immediately; debounce resets |
| User stops typing for 1 s | `flushPatch()` fires; single `save_config` IPC call with accumulated patch |
| User switches section mid-edit | `debounceTimer` still pending; fires when timer expires |
| Component unmounts (page exit) | `useEffect` cleanup calls `flushPatch()` synchronously |
| Validation error present | Debounce still fires; Rust validates nothing — save always proceeds; errors are UI-only |
| Network/IPC error on save | `saving` → false; error logged; local state retains the edits; retry on next change |

**No Save button** appears anywhere. The "Saving..." toast in the shell (see Section 7.2) is the only write indicator.

---

## 9. Input Validation

Validation runs synchronously in `useConfig.update()` via the `validate()` function (Section 6). All error checks are documented below:

| Field path | Rule | Message |
|------------|------|---------|
| `appearance.font_size` | 10 ≤ value ≤ 24 | "Font size must be between 10 and 24." |
| `ai.gateway_url` | Empty or valid `http(s)://` URL | "Must be a valid http:// or https:// URL." |
| `ai.temperature` | 0 ≤ value ≤ 2 | "Temperature must be between 0 and 2." |
| `ai.max_tokens` | 256 ≤ value ≤ 128,000 | "Max tokens must be between 256 and 128,000." |
| `terminal.shell` | Non-empty string | "Shell path is required." |
| `agents.max_concurrent` | 1 ≤ value ≤ 10 | "Concurrent agents must be between 1 and 10." |
| `agents.a2a_port` | 1024 ≤ value ≤ 65535 | "A2A port must be between 1024 and 65535." |
| `network.proxy_url` | Empty or valid `http(s)://` URL | "Proxy URL must be a valid http:// or https:// URL." |
| `integrations.jira.base_url` | Empty or valid `http(s)://` URL | "Jira URL must be a valid http:// or https:// URL." |

**Display rules:**
- Error replaces helpText below the field when `error` is set.
- Sidebar nav item shows a red dot if any field in that section has a validation error.
- Error state does not block the debounced save — the UI informs the user but writes proceed regardless, allowing the user to fix the value without losing partial progress.

---

## 10. `config-changed` Event Propagation

Every `save_config` Rust call emits a Tauri event `config-changed` with the payload:

```typescript
interface ConfigChangedPayload {
  scope: "workspace" | "global";
  path: string;           // absolute path to the file that changed
}
```

Subscribers:

| Subscriber | Effect |
|------------|--------|
| `useConfig()` hook | Reloads full resolved config unless `isSelfEmit` flag is set |
| `WorkspaceContext` | Re-reads workspace-related settings (workspace path, theme) |
| `TerminalPage` | Picks up new shell path, env vars (applies to next PTY session only) |
| AI agents (via companion API) | `companion_api.rs` broadcasts `config-changed` to connected A2A clients |

The `isSelfEmit` flag in `useConfig()` prevents the hook from reloading when it was the source of the write — the optimistic state is already correct.

---

## 11. AI Agent Settings Modification

Agents interact with settings through the companion API (`companion_api.rs`), not directly via `save_config`. This ensures the impact analysis gate is always honored.

### 11.1 Agent Reads Config

```rust
// src-tauri/src/companion_api.rs (existing module, new handler)

/// Called by an A2A agent to read the current resolved config.
/// Returns the full ResolvedConfig including source provenance.
/// Secret values are masked ("***") unless the agent holds a specific capability.
#[tauri::command]
pub async fn agent_read_config(workspace: Option<String>) -> Result<serde_json::Value, String> {
    let resolved = crate::config::resolve_config(workspace).await?;
    // Mask secret values from agents by default.
    Ok(mask_secrets(serde_json::to_value(resolved).unwrap()))
}
```

### 11.2 Agent Proposes Config Change

Agents propose a change via a structured action — the companion API runs impact analysis before deciding whether to auto-apply or gate.

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentConfigChangeProposal {
    pub agent_slug: String,
    pub rationale: String,
    pub scope: ConfigScope,
    pub patch: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImpactAnalysis {
    pub risk_level: RiskLevel,
    pub affected_features: Vec<String>,
    pub requires_restart: bool,
    pub summary: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,    // auto-apply
    Medium, // auto-apply + notify user
    High,   // human gate required
}
```

```typescript
// TypeScript types for the frontend gate UI

interface AgentConfigChangeProposal {
  agent_slug: string;
  rationale: string;
  scope: ConfigScope;
  patch: ConfigPatch;
}

interface ImpactAnalysis {
  risk_level: "low" | "medium" | "high";
  affected_features: string[];
  requires_restart: boolean;
  summary: string;
}

interface ConfigChangeGate {
  proposal: AgentConfigChangeProposal;
  impact: ImpactAnalysis;
  /** Approve: apply as-is */
  onApprove: () => Promise<void>;
  /** Modify: open settings page with the patch pre-filled for human review */
  onModify: () => void;
  /** Reject: discard proposal */
  onReject: () => void;
}
```

### 11.3 Impact Analysis Rules

| Changed key(s) | Risk | Rationale |
|----------------|------|-----------|
| `appearance.*` | Low | Visual only, no functional impact |
| `telemetry.*` | Low | Privacy preference, non-breaking |
| `ai.default_model` | Low | Chat sessions pick up new model immediately |
| `ai.temperature`, `ai.max_tokens` | Low | Model parameter change |
| `terminal.env`, `terminal.shell` | Medium | Affects next PTY session, not current |
| `git.*` | Medium | Changes auto-fetch or commit behavior |
| `agents.max_concurrent` | Medium | Resource usage change |
| `agents.gates.*` | High | Changes approval workflow; may disable human oversight |
| `ai.gateway_url`, `ai.gateway_token` | High | All AI functionality depends on connectivity |
| `integrations.*` | High | Credentials; affects external service connectivity |
| `network.*` | High | Network surface change |
| Any `*_ref` (keychain secret) | High | Credential modification |

### 11.4 Gate UI Mockup

High-risk proposals appear as a modal gate in the NotificationCenter:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Agent Config Change Request                           [High Risk]     │
├──────────────────────────────────────────────────────────────────────┤
│ Agent: council-tech-lead                                             │
│ Rationale: "Switching to claude-opus-4-5 for better code review      │
│             quality during Phase 2 refactor."                        │
│                                                                      │
│ Proposed changes:                                                    │
│   ai.default_model  claude-sonnet-4-6  →  claude-opus-4-5           │
│   ai.gateway_url    (unchanged)                                      │
│                                                                      │
│ Impact Analysis:                                                     │
│   Affected features: Chat, AgentsCouncil, CodingWorkflow               │
│   Requires restart: No                                               │
│   Risk: HIGH — gateway_token also affected by provider change        │
│                                                                      │
│            [Approve]      [Modify in Settings]      [Reject]         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 12. New Settings Sections

### 12.1 LLM Providers (`LlmProvidersSection`)

Manages the `config.ai.providers` array. Each provider entry has:

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Providers                                      [+ Add Provider] │
├─────────────────────────────────────────────────────────────────────┤
│ ● Anthropic (claude-sonnet-4-6)        [enabled]  [Edit] [Remove]  │
│ ● OpenAI (gpt-4o)                      [disabled] [Edit] [Remove]  │
│ ● My Custom Gateway (llama-3-70b)      [enabled]  [Edit] [Remove]  │
└─────────────────────────────────────────────────────────────────────┘

Add / Edit Provider dialog:
  Name: _________________
  Base URL: _____________    (validated: must be https://)
  API Key: ██████████████    (stored in keychain as provider_<id>_key)
  Default Model: ________
  [Enable]  [Cancel] [Save]
```

### 12.2 CLI Tools (`TerminalSection` — tools subsection)

Reads from `~/.LiteDuck/tools.json`. Managed separately in `TerminalSection` as a collapsible subsection:

```
▼ CLI Tool Slots

  Slot          Command                Status
  claude        /opt/homebrew/bin/claude  ✓ found
  gh            /opt/homebrew/bin/gh      ✓ found
  docker        /usr/local/bin/docker     ✓ found
  custom_1      (not configured)          —

  [+ Add Tool Slot]
```

### 12.3 Workspace Groups (`WorkspaceGroupsSection`)

Manages `config.agents.workspace_groups` plus the global `~/.LiteDuck/groups.json`:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workspace Groups                                   [+ New Group]    │
├─────────────────────────────────────────────────────────────────────┤
│ Bemind Labs (3 workspaces)                         [Edit] [Remove] │
│   /Users/lps/BemindLabs/build-on-openclaw                          │
│   /Users/lps/BemindLabs/openclaw                                   │
│   /Users/lps/BemindLabs/app-liteduck                               │
│   Shared memory: on   Shared agents: on                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.4 Quality Gates (`AgentsSection` — gates subsection)

```
▼ Agent Quality Gates

  [x] Require approval for file writes
  [x] Require approval for git push
  [x] Require approval for config changes     ← this very section
  [ ] Auto-approve low-risk actions

  These gates apply to all AI agent actions across all workspaces.
  Disabling gates bypasses the human-in-the-loop workflow (ADR-001 P3).
```

---

## 13. Migration from `settings.db` (LD-36)

Migration is a one-time event, not a read-through layer. `settings.db` is never read after migration completes.

### 13.1 Migration Wizard (part of LD-36, not EPIC-10)

The wizard runs on first launch after upgrade. It exports `settings.db` to `config.json` and archives the database.

```rust
// src-tauri/src/migration.rs

/// Migrates settings from settings.db to config.json.
/// Called once on startup when ~/.LiteDuck/config.json does not exist
/// but settings.db does.
pub async fn migrate_settings_db_to_config_json(app: &tauri::AppHandle) -> Result<(), String> {
    let db_path = app_data_dir(app)?.join("settings.db");
    if !db_path.exists() {
        return Ok(());
    }
    let global_config_path = crate::config::global_config_path();
    if global_config_path.exists() {
        // Migration already done; db is stale — archive it.
        archive_settings_db(&db_path)?;
        return Ok(());
    }

    // Read all key-value pairs from settings.db.
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let all_settings = read_all_settings_from_db(&conn)?;

    // Map flat keys to the typed Config struct.
    let config = map_flat_settings_to_config(all_settings).await?;

    // Write to ~/.LiteDuck/config.json.
    let parent = global_config_path.parent().unwrap();
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&global_config_path, json).map_err(|e| e.to_string())?;

    // Archive settings.db (rename, do not delete — allows rollback).
    archive_settings_db(&db_path)?;

    Ok(())
}
```

**Key mapping from flat `settings.db` to typed `Config`:**

| `settings.db` key | `Config` path |
|-------------------|---------------|
| `theme` | `appearance.theme` |
| `workspace_directory` | stored in `workspaces.json` as active workspace |
| `clone_parent_directory` | `git.clone_parent_dir` |
| `github_token` _(keychain)_ | `integrations.github.token_ref` → `${keychain:github_token}` |
| `openclaw_gateway_url` | `ai.gateway_url` |
| `openclaw_token` _(keychain)_ | `ai.gateway_token` → `${keychain:openclaw_token}` |
| `terminal_shell` | `terminal.shell` |
| `git_auto_fetch` | `git.auto_fetch` |
| `git_fetch_interval` | `git.fetch_interval_secs` |
| `agents_max_concurrent` | `agents.max_concurrent` |
| `lan_chat_enabled` | `network.lan_chat_enabled` |
| `lan_display_name` | `network.lan_display_name` |
| `telemetry_enabled` | `telemetry.enabled` |

### 13.2 Post-Migration State

After migration, `settings.db` is renamed to `settings.db.migrated-<timestamp>` in the app data directory. The file is preserved for 30 days, then the app purges it on the next launch. The migration wizard is never triggered again once `~/.LiteDuck/config.json` exists.

---

## 14. Story Breakdown

### LD-42: Split SettingsPage into Section Components

**Scope:** Structural decomposition only. No behavior changes. Existing `getSetting` / `saveSetting` calls remain intact during this story — the hook migration happens in LD-43.

Tasks:
- T1: Create `src/pages/settings/` directory and `SettingsPage.tsx` shell with sidebar nav
- T2: Extract `AppearanceSection`, `TerminalSection`, `GitSection` (currently SECTIONS[0-2])
- T3: Extract `AiSection`, `NetworkSection`, `IntegrationsSection` (currently SECTIONS[3-5])
- T4: Extract `AgentsSection`, `McpSection`, `TelemetrySection`, `AboutSection`
- T5: Create `LlmProvidersSection` and `WorkspaceGroupsSection` stubs (empty, wired to nav)
- T6: Create shared field components (`SettingField`, `SettingSecret`, `SettingSelect`, `SettingToggle`, `ScopeIndicator`, `SectionHeader`)
- T7: Update router/imports to point to new path; verify all existing functionality works
- T8: Delete `src/pages/SettingsPage.tsx` (the original 3,332-line file)
- T9: Write unit tests for each section component (render + basic interaction)

Acceptance criteria: All 12 sections render. All existing settings still load and save correctly. Each section file is under 300 lines.

### LD-43: `useConfig()` Hook

**Scope:** Implement `src/lib/config.ts`, `src-tauri/src/config.rs`, and `src/hooks/useConfig.ts`. Replace all `getSetting` / `saveSetting` calls in sections with `useConfig()`.

Tasks:
- T1: Implement `Config` struct and all sub-structs in `config.rs`
- T2: Implement `resolve_config()` Tauri command with read chain
- T3: Implement `save_config()` Tauri command with write chain + keychain secret handling
- T4: Register new commands in `lib.rs`
- T5: Implement `src/lib/config.ts` TypeScript wrappers
- T6: Implement `src/hooks/useConfig.ts` with optimistic updates and `config-changed` subscription
- T7: Replace all `getSetting` / `saveSetting` / `getSettings` / `getSecrets` calls in section components
- T8: Verify `settings.ts` imports are removed from all section components (linting rule or grep check)
- T9: Write unit tests for `useConfig()` hook (mock Tauri IPC)
- T10: Write Rust unit tests for `resolve_config()` merge logic and `parse_keychain_ref()`

Acceptance criteria: All settings read from JSON chain. No section calls `getSetting` or `saveSetting`. `config-changed` events propagate correctly to all hook instances.

### LD-44: Auto-Save with Debounce

**Scope:** Debounce and flush logic in `useConfig()`. Saving toast in `SettingsPage` shell. No Save button.

Tasks:
- T1: Implement 1 s debounce in `useConfig.update()` (already designed in Section 6)
- T2: Implement `flush()` and unmount-flush in `useEffect` cleanup
- T3: Add `saving` indicator (toast) to SettingsPage shell
- T4: Add `isSelfEmit` flag to prevent reload on own writes
- T5: Write integration tests: update → wait 1.1 s → assert `save_config` called once
- T6: Write tests for flush-on-unmount and flush-on-rapid-changes (only one IPC call per debounce window)

Acceptance criteria: No Save button exists anywhere in Settings. Changes persist within 1 second of the last keypress. `save_config` is called at most once per debounce window regardless of number of field changes.

### LD-45: Input Validation

**Scope:** `validate()` function in `useConfig.ts`, error display in `SettingField`, red-dot in sidebar nav.

Tasks:
- T1: Implement `validate()` covering all rules from Section 9
- T2: Wire `errors` into `SettingField` and `SettingSecret` (error prop replaces helpText)
- T3: Wire `errors` into sidebar nav red-dot (Section 7.2)
- T4: Verify validation runs on initial load as well as on each update
- T5: Write unit tests for every validation rule (happy path and boundary violations)
- T6: Write Vitest snapshot tests for error display in `SettingField`

Acceptance criteria: All rules from Section 9 are enforced. Errors display inline beneath the offending field. The sidebar nav dot appears when any field in a section has an error. No validation error blocks saving.

---

## 15. UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LiteDuck Settings                                          [Saving...]     │
├───────────────────┬─────────────────────────────────────────────────────────┤
│                   │                                                          │
│  Appearance       │  AI                                    [global]         │
│  AI           ●  │  ─────────────────────────────────────────────────────  │
│  LLM Providers    │  Connection details for the OpenClaw gateway.           │
│  Terminal         │                                                          │
│  Git              │  Gateway URL                                             │
│  Agents           │  ┌────────────────────────────────────┐                 │
│  Workspace Groups │  │ http://localhost:3000               │  [Test]  ✓      │
│  Network          │  └────────────────────────────────────┘                 │
│  Integrations     │  Base URL only — no trailing /v1 or /api.               │
│  MCP Servers      │                                                          │
│  Telemetry        │  Gateway Token                                           │
│  About            │  ┌────────────────────────────────────┐ [show]          │
│                   │  │ ••••••••••••••••                    │                 │
│                   │  └────────────────────────────────────┘                 │
│                   │  Stored in the OS keychain.                              │
│                   │                                                          │
│                   │  Default Model                                           │
│                   │  ┌──────────────────────────┐                           │
│                   │  │ Claude Sonnet 4.6      ▼  │                          │
│                   │  └──────────────────────────┘                           │
│                   │                                                          │
│                   │  Temperature                                             │
│                   │  ┌──────┐                                                │
│                   │  │ 0.7  │                                                │
│                   │  └──────┘                                                │
│                   │  0 (deterministic) to 2 (creative).                     │
│                   │                                                          │
│                   │  Max Tokens                                              │
│                   │  ┌────────┐                                              │
│                   │  │  4096  │                                              │
│                   │  └────────┘                                              │
│                   │  Range: 256–128,000.                                     │
│                   │                                                          │
└───────────────────┴─────────────────────────────────────────────────────────┘

● = section has validation error (red dot in nav)
[global] = ScopeIndicator badge showing which config layer this section came from
[Saving...] = auto-save toast, only visible during the debounce flush
```

---

## 16. Testing Strategy

### Frontend (Vitest)

| Test file | Coverage target |
|-----------|----------------|
| `src/hooks/useConfig.test.ts` | `resolve_config` call on mount; optimistic update; debounce accumulation; flush on unmount; `config-changed` reload; `isSelfEmit` skip |
| `src/lib/config.test.ts` | `resolveConfig` / `saveConfig` wrappers (Tauri mock) |
| `src/pages/settings/sections/*.test.tsx` | Render; field change calls `update()`; error renders correctly |
| `src/pages/settings/components/*.test.tsx` | `SettingField` error vs helpText display; `ScopeIndicator` badge variants |
| `useConfig.validate.test.ts` | Every validation rule, both happy and violation cases |

Tauri commands mocked via existing `src/test/tauri-mocks.ts`:
```typescript
// Add to tauri-mocks.ts
mockTauriInvoke("resolve_config", () => Promise.resolve({ config: mockConfig, source: {}, secret_keys: [] }));
mockTauriInvoke("save_config", () => Promise.resolve());
```

### Rust (cargo test)

| Test | Coverage |
|------|----------|
| `config::tests::merge_workspace_over_global` | Workspace layer wins |
| `config::tests::merge_global_over_default` | Global layer wins when workspace absent |
| `config::tests::merge_uses_default_when_both_absent` | Built-in fallback |
| `config::tests::parse_keychain_ref_valid` | `${keychain:my_key}` → `"my_key"` |
| `config::tests::parse_keychain_ref_invalid` | Non-matching string → `None` |
| `config::tests::read_missing_file_returns_none` | Missing config treated as empty layer |
| `config::tests::read_malformed_file_returns_err` | Bad JSON → error |
| `migration::tests::mapping_flat_key_theme` | `theme` → `appearance.theme` |
| `migration::tests::mapping_secret_github_token` | Keychain ref written; value stored in keychain |

---

## 17. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Users with `settings.db` but no migration wizard (upgrading before EPIC-8/LD-36) see empty settings | Medium | `resolve_config()` checks for `settings.db` as a read-once migration fallback only during the transition window; this fallback is removed post-LD-36 |
| Concurrent writes from two SettingsPage windows (unlikely but theoretically possible via multiple Tauri windows) | Low | `save_config` serializes writes through Rust; last write wins; `config-changed` event triggers reload in all hooks |
| Debounce timer fires after Tauri window is destroyed | Low | `useEffect` cleanup calls `flushPatch()` synchronously before unmount; `invoke` may fail but is caught silently |
| Agent proposes a config change while user is mid-edit (debounce pending) | Low | `config-changed` event triggers `isSelfEmit = false` reload; user's pending patch is merged on top during the optimistic update cycle |
| Large `providers[]` array causes slow JSON serialization | Very low | Array bounded to 20 entries in UI; no performance concern |

---

## 18. Open Questions

1. **Workspace-scoped AI settings:** Should `ai.gateway_url` be overridable per workspace? The current design allows it (workspace layer can override any section). A team workspace might use a different gateway than the developer's personal gateway. Decision needed before LD-43 implementation.

2. **Config schema versioning:** `config.json` currently has `"version": 1`. When fields are added or renamed in a future release, does the migration path use serde `#[serde(rename)]`, a dedicated migration function, or a schema version bump with explicit `migrate_v1_to_v2()`? Recommend establishing this pattern in EPIC-10 even if no migration is needed now.

3. **Agent capability for reading secrets:** Section 11.1 masks secrets from agents by default. Should certain trusted agents (e.g., `council-tech-lead`) have a declared capability that allows them to read the resolved gateway token for connectivity testing? Needs alignment with the A2A capability model in EPIC-11.
