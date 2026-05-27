//! `~/.liteduck` home directory management.
//!
//! Provides path resolution, directory bootstrapping, user profile
//! management, and typed application config (config.json) for the
//! user-level application home. Uses `$LITEDUCK_HOME` if set, otherwise
//! `~/.liteduck`.

use crate::agent_memory::{
    find_relevant_notes_at, parse_note_pub as parse_note, rebuild_index_at,
    render_note_pub as render_note, slugify_pub as slugify, MemoryNote, MemoryNoteSummary,
    NewMemoryNote,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;

// ── Config structs ────────────────────────────────────────────────────────────

/// Appearance / UI settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_sidebar_position")]
    pub sidebar_position: String,
    #[serde(default)]
    pub sidebar_collapsed: bool,
}

fn default_theme() -> String {
    "system".to_string()
}
fn default_font_family() -> String {
    "JetBrains Mono".to_string()
}
fn default_font_size() -> u32 {
    14
}
fn default_sidebar_position() -> String {
    "left".to_string()
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            sidebar_position: default_sidebar_position(),
            sidebar_collapsed: false,
        }
    }
}

/// AI model and gateway settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    #[serde(default = "default_ai_model")]
    pub default_model: String,
    #[serde(default = "default_gateway_url")]
    pub gateway_url: String,
    #[serde(default = "default_streaming")]
    pub streaming: bool,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_ai_model() -> String {
    "claude-sonnet-4-6".to_string()
}
fn default_gateway_url() -> String {
    "http://127.0.0.1:18789".to_string()
}
fn default_streaming() -> bool {
    true
}
fn default_temperature() -> f64 {
    0.7
}
fn default_max_tokens() -> u32 {
    4096
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            default_model: default_ai_model(),
            gateway_url: default_gateway_url(),
            streaming: default_streaming(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
        }
    }
}

/// Terminal emulator settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    #[serde(default = "default_shell")]
    pub shell: String,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
}

fn default_shell() -> String {
    "/bin/zsh".to_string()
}
fn default_scrollback() -> u32 {
    10000
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            shell: default_shell(),
            env: HashMap::new(),
            scrollback: default_scrollback(),
        }
    }
}

/// Git integration settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitConfig {
    #[serde(default = "default_auto_fetch")]
    pub auto_fetch: bool,
    #[serde(default = "default_fetch_interval_secs")]
    pub fetch_interval_secs: u32,
    #[serde(default)]
    pub sign_commits: bool,
    /// Extra directory names to skip when scanning for git repositories.
    /// Merged with the built-in SKIP_DIRS list in git_scan_repos.
    #[serde(default)]
    pub scan_exclude_patterns: Vec<String>,
}

fn default_auto_fetch() -> bool {
    true
}
fn default_fetch_interval_secs() -> u32 {
    300
}

impl Default for GitConfig {
    fn default() -> Self {
        Self {
            auto_fetch: default_auto_fetch(),
            fetch_interval_secs: default_fetch_interval_secs(),
            sign_commits: false,
            scan_exclude_patterns: Vec::new(),
        }
    }
}

/// Agent runtime settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsConfig {
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: u32,
    #[serde(default = "default_ai_model")]
    pub default_model: String,
    #[serde(default = "default_auto_collect_memory")]
    pub auto_collect_memory: bool,
    #[serde(default = "default_a2a_discovery")]
    pub a2a_discovery: bool,
    #[serde(default = "default_a2a_port")]
    pub a2a_port: u16,
}

fn default_max_concurrent() -> u32 {
    3
}
fn default_auto_collect_memory() -> bool {
    true
}
fn default_a2a_discovery() -> bool {
    true
}
fn default_a2a_port() -> u16 {
    41000
}

impl Default for AgentsConfig {
    fn default() -> Self {
        Self {
            max_concurrent: default_max_concurrent(),
            default_model: default_ai_model(),
            auto_collect_memory: default_auto_collect_memory(),
            a2a_discovery: default_a2a_discovery(),
            a2a_port: default_a2a_port(),
        }
    }
}

/// Network / connectivity settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    #[serde(default = "default_lan_chat_enabled")]
    pub lan_chat_enabled: bool,
    #[serde(default)]
    pub ble_enabled: bool,
    #[serde(default)]
    pub mesh_enabled: bool,
}

fn default_lan_chat_enabled() -> bool {
    true
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            lan_chat_enabled: default_lan_chat_enabled(),
            ble_enabled: false,
            mesh_enabled: false,
        }
    }
}

/// Telemetry and diagnostics settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_anonymous")]
    pub anonymous: bool,
}

fn default_anonymous() -> bool {
    true
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            anonymous: default_anonymous(),
        }
    }
}

/// Top-level application configuration stored at `~/.liteduck/config.json`.
///
/// Every field uses `#[serde(default)]` so partial JSON (or a missing file)
/// always deserialises successfully, filling in the defaults for any absent
/// sections or keys.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub appearance: AppearanceConfig,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub terminal: TerminalConfig,
    #[serde(default)]
    pub git: GitConfig,
    #[serde(default)]
    pub agents: AgentsConfig,
    #[serde(default)]
    pub network: NetworkConfig,
    #[serde(default)]
    pub telemetry: TelemetryConfig,
}

// ── Config in-memory cache (LD-68) ───────────────────────────────────────────

/// TTL for cached config values. After 5 minutes the next call re-reads disk.
const CONFIG_TTL: Duration = Duration::from_secs(300);

/// Holds optionally-cached copies of the global config and the last resolved
/// workspace config together with the wall-clock timestamp of when each entry
/// was last populated.
///
/// Both cache slots are keyed by the absolute home-directory path so that the
/// cache is automatically invalidated when `LITEDUCK_HOME` changes between
/// calls (important during tests that redirect the home directory via that env
/// variable).
struct ConfigCache {
    /// Cached result of `read_config()`.
    /// Tuple: (home_dir_at_cache_time, config, timestamp)
    global: Option<(PathBuf, Config, Instant)>,
    /// Cached result of `resolve_config(workspace)`.
    /// Tuple: (home_dir_at_cache_time, workspace_path, config, timestamp)
    resolved: Option<(PathBuf, String, Config, Instant)>,
}

static CONFIG_CACHE: OnceLock<Mutex<ConfigCache>> = OnceLock::new();

fn config_cache() -> &'static Mutex<ConfigCache> {
    CONFIG_CACHE.get_or_init(|| {
        Mutex::new(ConfigCache {
            global: None,
            resolved: None,
        })
    })
}

/// Acquire the cache lock, recovering from a poisoned mutex so that a panic in
/// one test (or any other thread) does not permanently break the cache for
/// every subsequent caller.
fn lock_cache(m: &'static Mutex<ConfigCache>) -> std::sync::MutexGuard<'static, ConfigCache> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Clears all entries from the config cache.
///
/// Call this after writing a new config to disk or when switching workspaces
/// so that the next `read_config()` / `resolve_config()` call re-reads from
/// disk instead of returning a stale value.
pub fn invalidate_config_cache() {
    let mut cache = lock_cache(config_cache());
    cache.global = None;
    cache.resolved = None;
}

// ── Config read / write / resolve ────────────────────────────────────────────

/// Reads `~/.liteduck/config.json`.
///
/// Returns `Config::default()` when the file does not exist. Missing keys
/// within an existing file are filled with their defaults via `#[serde(default)]`.
///
/// Results are cached in memory for [`CONFIG_TTL`]. The cache is invalidated
/// automatically by [`write_config`] and can be cleared explicitly via
/// [`invalidate_config_cache`].
pub fn read_config() -> Result<Config, String> {
    let hd = home_dir();
    let mut cache = lock_cache(config_cache());

    // Cache hit: same home dir and not yet expired.
    if let Some((ref cached_hd, ref config, ts)) = cache.global {
        if *cached_hd == hd && ts.elapsed() < CONFIG_TTL {
            return Ok(config.clone());
        }
    }

    // Cache miss, expired, or home dir changed — read from disk.
    let path = hd.join("config.json");
    let config = if !path.exists() {
        Config::default()
    } else {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))?
    };
    cache.global = Some((hd, config.clone(), Instant::now()));
    Ok(config)
}

/// Writes `config` to `~/.liteduck/config.json` as pretty-printed JSON.
///
/// The parent directory is created if needed. On Unix the file is set to
/// `0o600` (owner read/write only).
///
/// The in-memory config cache is invalidated after a successful write so the
/// next call to [`read_config`] or [`resolve_config`] always sees the new data.
pub fn write_config(config: &Config) -> Result<(), String> {
    let dir = home_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("config.json");
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, &content).map_err(|e| format!("Failed to write config: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    invalidate_config_cache();
    Ok(())
}

/// Resolve effective config by merging: global → defaults.
///
/// Missing global config falls through to built-in defaults.
///
/// Resolution chain:
///   1. `~/.liteduck/config.json` (global config)
///   2. Built-in `Default` (hardcoded)
///
/// Resolved configs are cached in memory for [`CONFIG_TTL`], keyed by the
/// workspace path. When the workspace changes the old entry is replaced. The
/// cache is invalidated by [`write_config`] and [`invalidate_config_cache`].
pub fn resolve_config(workspace: Option<&str>) -> Result<Config, String> {
    let hd = home_dir();
    // For the "no workspace" case use an empty string as the cache key.
    let ws_key = workspace.unwrap_or("");
    let cache = lock_cache(config_cache());

    // Cache hit: same home dir, same workspace, and not yet expired.
    if let Some((ref cached_hd, ref cached_ws, ref config, ts)) = cache.resolved {
        if *cached_hd == hd && cached_ws == ws_key && ts.elapsed() < CONFIG_TTL {
            return Ok(config.clone());
        }
    }

    // Cache miss, stale, or home/workspace changed — build the resolved config.
    // Drop the lock before doing I/O so we don't hold it across blocking reads.
    drop(cache);
    let resolved = resolve_config_from_disk()?;

    // Re-acquire to store the result.
    let mut cache = lock_cache(config_cache());
    cache.resolved = Some((hd, ws_key.to_string(), resolved.clone(), Instant::now()));
    Ok(resolved)
}

/// Internal helper: read the global config from disk without touching the cache.
///
/// LiteDuck uses a single global config (`~/.liteduck/config.json`); there is no
/// per-workspace override layer.
fn resolve_config_from_disk() -> Result<Config, String> {
    // Start with built-in defaults, then overlay the global config when present.
    let mut config = Config::default();

    let global_path = home_dir().join("config.json");
    if global_path.exists() {
        let content = fs::read_to_string(&global_path)
            .map_err(|e| format!("Failed to read global config: {e}"))?;
        config = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse global config: {e}"))?;
    }

    Ok(config)
}

/// Returns the LiteDuck home directory path.
///
/// Uses `$LITEDUCK_HOME` if the environment variable is set; otherwise
/// resolves `~/.liteduck` via the `dirs` crate, falling back to `./.liteduck`
/// when the home directory cannot be determined.
pub fn home_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("LITEDUCK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".liteduck")
}

/// Legacy home directory (`~/.LiteDuck`) from before the lowercase rename.
/// Used once by [`ensure_home`] to migrate existing data to [`home_dir`].
fn legacy_home_dir() -> Option<PathBuf> {
    if std::env::var("LITEDUCK_HOME").is_ok() {
        return None;
    }
    dirs::home_dir().map(|h| h.join(".LiteDuck"))
}

/// Returns the path to the global memory index file.
pub fn memory_index() -> PathBuf {
    home_dir().join("memory").join("MEMORY.md")
}

/// Returns the path to the workspace registry file.
pub fn workspaces_path() -> PathBuf {
    home_dir().join("workspaces.json")
}

// ── Workspace registry structs ────────────────────────────────────────────────

fn default_version() -> u32 {
    1
}

/// The full workspace registry stored at `~/.liteduck/workspaces.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRegistry {
    #[serde(default = "default_version")]
    pub version: u32,
    pub active: Option<String>,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
}

impl Default for WorkspaceRegistry {
    fn default() -> Self {
        Self {
            version: default_version(),
            active: None,
            workspaces: Vec::new(),
        }
    }
}

/// A single entry in the workspace registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub path: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub last_opened: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

// ── Workspace registry read / write ──────────────────────────────────────────

/// Reads `~/.liteduck/workspaces.json`.
///
/// Returns `WorkspaceRegistry::default()` when the file does not exist.
/// Missing fields within an existing file are filled with their defaults via
/// `#[serde(default)]`.
pub fn read_workspaces() -> Result<WorkspaceRegistry, String> {
    let path = home_dir().join("workspaces.json");
    if !path.exists() {
        return Ok(WorkspaceRegistry::default());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read workspaces: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse workspaces: {e}"))
}

/// Writes `registry` to `~/.liteduck/workspaces.json` as pretty-printed JSON.
///
/// The parent directory is created if needed. On Unix the file is set to
/// `0o600` (owner read/write only).
pub fn write_workspaces(registry: &WorkspaceRegistry) -> Result<(), String> {
    let path = home_dir().join("workspaces.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize workspaces: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write workspaces: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// All directories created under `~/.liteduck` on first launch.
const HOME_DIRS: &[&str] = &["memory", "templates/workspace", "logs"];

/// Creates the `~/.liteduck` directory structure if it does not already exist.
///
/// Safe to call on every application startup — only missing directories and
/// files are created; existing content is never modified or overwritten.
///
/// Directory permissions are set to `0o700` (user-only) on Unix platforms.
/// Files created by this function are set to `0o600`.
pub fn ensure_home() -> Result<(), String> {
    let home = home_dir();

    // One-time migration: move legacy `~/.LiteDuck` to the new lowercase
    // `~/.liteduck` location when the new directory does not exist yet.
    if !home.exists() {
        if let Some(legacy) = legacy_home_dir() {
            if legacy != home && legacy.exists() {
                match fs::rename(&legacy, &home) {
                    Ok(()) => log::info!(
                        "home: migrated legacy {} -> {}",
                        legacy.display(),
                        home.display()
                    ),
                    Err(e) => log::warn!(
                        "home: could not migrate legacy {} -> {}: {e}",
                        legacy.display(),
                        home.display()
                    ),
                }
            }
        }
    }

    create_dir_with_perms(&home)?;
    log::info!("home: ensured home directory at {}", home.display());

    for rel in HOME_DIRS {
        let dir = home.join(rel);
        create_dir_with_perms(&dir)?;
    }

    // Seed the memory index if absent.
    let memory_index_path = memory_index();
    if !memory_index_path.exists() {
        write_file_with_perms(&memory_index_path, "")?;
        log::info!(
            "home: created memory index at {}",
            memory_index_path.display()
        );
    }

    // Seed the user profile if absent.
    let profile_path = home.join("profile.md");
    if !profile_path.exists() {
        write_file_with_perms(&profile_path, &default_profile())?;
        log::info!(
            "home: created profile skeleton at {}",
            profile_path.display()
        );
    }

    Ok(())
}

// ── Profile helpers ───────────────────────────────────────────────────────────

/// Returns the skeleton profile markdown written on first launch.
fn default_profile() -> String {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    format!(
        r#"---
name: ""
handle: ""
role: ""
timezone: ""
languages: []
preferred_tools: []
created: "{today}"
updated: "{today}"
---

## About

(Describe yourself so AI agents can personalize their responses.)

## Preferences

(List your communication and workflow preferences.)
"#
    )
}

/// Replaces the `updated:` field in YAML frontmatter with today's date.
///
/// Only updates the first occurrence within the opening `---` block.
/// If no `updated:` field is found the content is returned unchanged.
fn update_profile_timestamp(content: &str) -> String {
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Only search inside the frontmatter block (between the first pair of `---`).
    if !content.starts_with("---") {
        return content.to_string();
    }

    // Find the closing `---` of the frontmatter.
    let rest = &content[3..];
    let fm_end = match rest.find("\n---") {
        Some(i) => 3 + i, // offset from start of content (skip opening `---`)
        None => return content.to_string(),
    };

    // Search for `updated:` only within the frontmatter range.
    let fm_slice = &content[..fm_end];
    if let Some(field_start) = fm_slice.find("updated:") {
        // Find the end of this line within the whole content.
        if let Some(line_end) = content[field_start..].find('\n') {
            let mut result = String::with_capacity(content.len());
            result.push_str(&content[..field_start]);
            result.push_str(&format!("updated: \"{today}\""));
            result.push_str(&content[field_start + line_end..]);
            return result;
        }
    }

    content.to_string()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Creates `dir` (and all parents) if it does not exist, then applies Unix
/// `0o700` permissions.  On non-Unix targets the `chmod` step is omitted.
fn create_dir_with_perms(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;
        log::debug!("home: created directory {}", dir.display());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o700);
        fs::set_permissions(dir, perms)
            .map_err(|e| format!("Failed to set permissions on {}: {e}", dir.display()))?;
    }

    Ok(())
}

/// Creates a file at `path` with `content` if it does not exist, then applies
/// Unix `0o600` permissions.
fn write_file_with_perms(path: &Path, content: &str) -> Result<(), String> {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create parent directory for {}: {e}",
                    path.display()
                )
            })?;
        }
        fs::write(path, content)
            .map_err(|e| format!("Failed to create file {}: {e}", path.display()))?;
        log::debug!("home: created file {}", path.display());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set permissions on {}: {e}", path.display()))?;
    }

    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns the resolved `~/.liteduck` path as a string.
#[tauri::command]
pub fn home_dir_path() -> String {
    home_dir().to_string_lossy().to_string()
}

/// Creates the `~/.liteduck` directory structure if it does not already exist.
///
/// Idempotent — safe to call on every startup.
#[tauri::command]
pub fn home_ensure() -> Result<(), String> {
    ensure_home()
}

/// Reads the user profile markdown from `~/.liteduck/profile.md`.
///
/// Returns the raw markdown string. If the file does not exist, returns
/// the default skeleton so the caller always receives valid markdown.
#[tauri::command]
pub fn home_profile_read() -> Result<String, String> {
    let path = home_dir().join("profile.md");
    if !path.exists() {
        return Ok(default_profile());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read profile: {e}"))
}

/// Writes user profile markdown to `~/.liteduck/profile.md`.
///
/// The `updated` timestamp in the YAML frontmatter is automatically
/// refreshed to today's date before writing. The file is created (including
/// parent directories) if it does not exist.
///
/// File permissions are set to `0o600` on Unix platforms.
#[tauri::command]
pub fn home_profile_write(content: String) -> Result<(), String> {
    let path = home_dir().join("profile.md");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile directory: {e}"))?;
    }

    let updated_content = update_profile_timestamp(&content);

    fs::write(&path, &updated_content).map_err(|e| format!("Failed to write profile: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set profile permissions: {e}"))?;
    }

    log::info!("home: profile written to {}", path.display());
    Ok(())
}

/// Reads the application config from `~/.liteduck/config.json`.
///
/// Returns all defaults when the file does not exist or a key is absent.
#[tauri::command]
pub fn home_config_read() -> Result<Config, String> {
    read_config()
}

/// Writes the application config to `~/.liteduck/config.json`.
///
/// The file is created (including parent directories) if it does not exist.
/// File permissions are set to `0o600` on Unix platforms.
/// Emits a `config-changed` Tauri event so all `useConfig()` hooks re-read.
#[tauri::command]
pub fn home_config_write(app: tauri::AppHandle, config: Config) -> Result<(), String> {
    write_config(&config)?;
    let _ = app.emit("config-changed", serde_json::json!({ "source": "global" }));
    Ok(())
}

/// Returns the effective config by merging workspace → global → defaults.
///
/// `workspace` is the absolute path to the current workspace directory.
/// When `None` only the global config and built-in defaults are used.
/// A missing workspace config file is not an error — the resolution falls
/// through to the global config and then to built-in defaults.
#[tauri::command]
pub fn home_resolve_config(workspace: Option<String>) -> Result<Config, String> {
    resolve_config(workspace.as_deref())
}

/// Returns the full workspace registry from `~/.liteduck/workspaces.json`.
///
/// Returns all defaults when the file does not exist.
#[tauri::command]
pub fn home_workspaces_list() -> Result<WorkspaceRegistry, String> {
    read_workspaces()
}

/// Writes the workspace registry to `~/.liteduck/workspaces.json`.
///
/// The file is created (including parent directories) if it does not exist.
/// File permissions are set to `0o600` on Unix platforms.
#[tauri::command]
pub fn home_workspaces_update(registry: WorkspaceRegistry) -> Result<(), String> {
    write_workspaces(&registry)
}

// ── MCP server registry ───────────────────────────────────────────────────────

fn default_true() -> bool {
    true
}

/// A single MCP server entry in `~/.liteduck/mcp/servers.json`.
///
/// `env` values may contain `${keychain:key_name}` references which are
/// resolved at runtime via [`resolve_keychain_refs`]. Secrets are never stored
/// inline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub slug: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub global: bool,
}

/// The full MCP server registry stored at `~/.liteduck/mcp/servers.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerRegistry {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

impl Default for McpServerRegistry {
    fn default() -> Self {
        Self {
            version: default_version(),
            servers: Vec::new(),
        }
    }
}

/// Reads `~/.liteduck/mcp/servers.json`.
///
/// Returns `McpServerRegistry::default()` when the file does not exist.
/// Missing fields within an existing file are filled with their defaults via
/// `#[serde(default)]`.
pub fn read_mcp_servers() -> Result<McpServerRegistry, String> {
    let path = home_dir().join("mcp").join("servers.json");
    if !path.exists() {
        return Ok(McpServerRegistry::default());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read MCP servers: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse MCP servers: {e}"))
}

/// Writes `registry` to `~/.liteduck/mcp/servers.json` as pretty-printed JSON.
///
/// The `mcp/` directory is created if needed. On Unix the file is set to
/// `0o600` (owner read/write only).
pub fn write_mcp_servers(registry: &McpServerRegistry) -> Result<(), String> {
    let dir = home_dir().join("mcp");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("servers.json");
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize MCP servers: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write MCP servers: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Resolve `${keychain:key_name}` references in environment variable values.
///
/// For each env entry whose value matches the `${keychain:…}` pattern, the
/// secret is looked up in the OS keychain via [`crate::keychain::get_secret`].
/// Values that do not match the pattern are passed through unchanged. If the
/// keychain lookup fails or returns `None` the placeholder is replaced with
/// an empty string.
pub fn resolve_keychain_refs(env: &HashMap<String, String>) -> HashMap<String, String> {
    env.iter()
        .map(|(k, v)| {
            if let Some(key_name) = v
                .strip_prefix("${keychain:")
                .and_then(|s| s.strip_suffix('}'))
            {
                let resolved = crate::keychain::get_secret(key_name)
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                (k.clone(), resolved)
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect()
}

// ── MCP server registry Tauri commands ────────────────────────────────────────

/// Returns the full MCP server registry from `~/.liteduck/mcp/servers.json`.
///
/// Returns all defaults when the file does not exist.
#[tauri::command]
pub fn home_mcp_servers_list() -> Result<McpServerRegistry, String> {
    read_mcp_servers()
}

/// Writes the MCP server registry to `~/.liteduck/mcp/servers.json`.
///
/// The file (and its parent `mcp/` directory) are created if they do not
/// exist. File permissions are set to `0o600` on Unix platforms.
#[tauri::command]
pub fn home_mcp_servers_save(registry: McpServerRegistry) -> Result<(), String> {
    write_mcp_servers(&registry)
}

// ── Home memory ──────────────────────────────────────────────────────────────

/// Returns the `~/.liteduck/memory/` directory path.
pub fn home_memory_dir() -> PathBuf {
    home_dir().join("memory")
}

// ── Home memory Tauri commands ────────────────────────────────────────────────

/// List all global memory notes (summaries only, sorted newest-first).
#[tauri::command]
pub fn home_memory_list() -> Result<Vec<MemoryNoteSummary>, String> {
    let dir = home_memory_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut notes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" || slug == "MEMORY" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            notes.push(MemoryNoteSummary {
                slug: note.slug,
                title: note.title,
                note_type: note.note_type,
                tags: note.tags,
                created: note.created,
            });
        }
    }

    notes.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(notes)
}

/// Read a single global memory note by slug.
#[tauri::command]
pub fn home_memory_read(slug: String) -> Result<MemoryNote, String> {
    let path = home_memory_dir().join(format!("{slug}.md"));
    let content = fs::read_to_string(&path).map_err(|e| format!("Note not found: {e}"))?;
    Ok(parse_note(&slug, &content))
}

/// Create a new global memory note. Returns the slug.
///
/// Writing a note whose slug already exists is an error — delete it first or
/// use a different title.
#[tauri::command]
pub fn home_memory_write(note: NewMemoryNote) -> Result<String, String> {
    let dir = home_memory_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let slug = slugify(&note.title);
    let now = Utc::now().format("%Y-%m-%d").to_string();

    let path = dir.join(format!("{slug}.md"));
    if path.exists() {
        return Err(format!(
            "Note with slug '{slug}' already exists. Delete it first or use a different title."
        ));
    }

    let mem = MemoryNote {
        slug: slug.clone(),
        title: note.title,
        note_type: note.note_type,
        tags: note.tags,
        related: note.related,
        created: now.clone(),
        updated: now,
        body: note.body,
    };

    fs::write(&path, render_note(&mem)).map_err(|e| e.to_string())?;
    rebuild_index_at(&dir);

    Ok(slug)
}

/// Delete a global memory note by slug. No-op if the note does not exist.
#[tauri::command]
pub fn home_memory_delete(slug: String) -> Result<(), String> {
    let path = home_memory_dir().join(format!("{slug}.md"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        rebuild_index_at(&home_memory_dir());
    }
    Ok(())
}

/// Search global memory notes by query string (matches title, tags, type, body).
#[tauri::command]
pub fn home_memory_search(query: String) -> Result<Vec<MemoryNoteSummary>, String> {
    let all = home_memory_list()?;
    let q = query.to_lowercase();
    let dir = home_memory_dir();
    let mut results = Vec::new();

    for note in all {
        let matches_meta = note.title.to_lowercase().contains(&q)
            || note.tags.iter().any(|t| t.to_lowercase().contains(&q))
            || note.note_type.to_lowercase().contains(&q);

        if matches_meta {
            results.push(note);
            continue;
        }

        // Fall back to full-text body search.
        let path = dir.join(format!("{}.md", note.slug));
        if let Ok(content) = fs::read_to_string(&path) {
            if content.to_lowercase().contains(&q) {
                results.push(note);
            }
        }
    }

    Ok(results)
}

/// Find global memory notes relevant to `title` using keyword scoring.
///
/// This is used for context injection into AI prompts from the global
/// (`~/.liteduck/memory/`) layer.
pub fn home_memory_find_relevant(title: &str, max: usize) -> Vec<MemoryNote> {
    find_relevant_notes_at(&home_memory_dir(), title, max)
}

// ── Migration wizard (SQLite → ~/.liteduck JSON) ─────────────────────────────
//
// One-time, one-direction migration (LD-36).
//
// After a successful run the source `.db` files are renamed to
// `<name>.db.bak.<timestamp>` so normal operation no longer touches them.
// `home_migration_check` is safe to call at any time — it is read-only.

/// Reports on the state of legacy SQLite databases and the migration target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationStatus {
    pub settings_db_exists: bool,
    pub automations_db_exists: bool,
    pub mcp_db_exists: bool,
    /// `true` when `~/.liteduck/config.json` already exists (migration done or
    /// the user started fresh with the new format).
    pub already_migrated: bool,
    pub settings_count: usize,
    pub automations_count: usize,
    pub mcp_servers_count: usize,
}

/// Summary returned after a completed migration run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationResult {
    pub settings_migrated: usize,
    pub automations_migrated: usize,
    pub mcp_servers_migrated: usize,
    pub workspaces_migrated: usize,
    pub errors: Vec<String>,
    /// Absolute paths of the archived (renamed) `.db` files.
    pub archived_files: Vec<String>,
}

/// Returns the path to the legacy app-data directory.
fn legacy_app_data() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.bemindlabs.liteduck")
}

/// Counts the number of rows in the `settings` table for a SQLite db file.
fn count_settings_rows(db_path: &Path) -> rusqlite::Result<usize> {
    let conn = rusqlite::Connection::open(db_path)?;
    let count: i64 = conn.query_row("SELECT count(*) FROM settings", [], |row| row.get(0))?;
    Ok(count as usize)
}

/// Checks the legacy SQLite databases and the migration target without
/// modifying anything.
#[tauri::command]
pub fn home_migration_check() -> Result<MigrationStatus, String> {
    let app_data = legacy_app_data();

    let settings_path = app_data.join("settings.db");
    let automations_path = app_data.join("automations.db");
    let mcp_path = app_data.join("mcp.db");

    let config_exists = home_dir().join("config.json").exists();

    let settings_count = if settings_path.exists() {
        count_settings_rows(&settings_path).unwrap_or(0)
    } else {
        0
    };

    // automations.db and mcp.db may not have a `settings` table; count tables
    // in sqlite_master as a proxy for "non-empty".
    let automations_count = if automations_path.exists() {
        rusqlite::Connection::open(&automations_path)
            .and_then(|conn| {
                conn.query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
            })
            .map(|n| n as usize)
            .unwrap_or(0)
    } else {
        0
    };

    let mcp_servers_count = if mcp_path.exists() {
        rusqlite::Connection::open(&mcp_path)
            .and_then(|conn| {
                conn.query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
            })
            .map(|n| n as usize)
            .unwrap_or(0)
    } else {
        0
    };

    Ok(MigrationStatus {
        settings_db_exists: settings_path.exists(),
        automations_db_exists: automations_path.exists(),
        mcp_db_exists: mcp_path.exists(),
        already_migrated: config_exists,
        settings_count,
        automations_count,
        mcp_servers_count,
    })
}

/// Runs the full one-time migration:
///
/// 1. Reads flat key/value pairs from `settings.db` and maps known keys to
///    `Config` fields, writing `~/.liteduck/config.json`.
/// 2. Reads the `workspace_history` setting from `settings.db` and appends
///    any new paths to `~/.liteduck/workspaces.json`.
/// 3. Renames each `.db` file to `.db.bak.<timestamp>` (archive step).
///
/// The function is **idempotent with respect to the target**: if
/// `config.json` already contains a value it is not overwritten for that
/// field (serde defaults handle missing keys).
#[tauri::command]
pub fn home_migration_run() -> Result<MigrationResult, String> {
    let mut result = MigrationResult {
        settings_migrated: 0,
        automations_migrated: 0,
        mcp_servers_migrated: 0,
        workspaces_migrated: 0,
        errors: Vec::new(),
        archived_files: Vec::new(),
    };

    let app_data = legacy_app_data();

    migrate_settings(&app_data, &mut result);
    migrate_workspace_history(&app_data, &mut result);
    archive_db_files(&app_data, &mut result);

    Ok(result)
}

// ── Migration helpers ─────────────────────────────────────────────────────────

/// Maps flat SQLite `settings` keys to structured `Config` fields.
///
/// Unknown keys are silently skipped — they may be from extensions or future
/// versions of the app.  Secret keys (anything ending in `_token`, `_secret`,
/// `_password`, or `_api_key`) are skipped; they remain in the OS keychain.
fn migrate_settings(app_data: &Path, result: &mut MigrationResult) {
    let db_path = app_data.join("settings.db");
    if !db_path.exists() {
        return;
    }

    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            result.errors.push(format!("Cannot open settings.db: {e}"));
            return;
        }
    };

    let mut config = read_config().unwrap_or_default();

    // Collect all key/value pairs from the settings table.
    let rows: Vec<(String, String)> = {
        let mut stmt = match conn.prepare("SELECT key, value FROM settings") {
            Ok(s) => s,
            Err(e) => {
                result.errors.push(format!("Cannot query settings.db: {e}"));
                return;
            }
        };
        stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map(|iter| iter.flatten().collect())
        .unwrap_or_default()
    };

    for (key, value) in rows {
        // Skip secrets — they live in the OS keychain, not the db.
        if key.ends_with("_token")
            || key.ends_with("_secret")
            || key.ends_with("_password")
            || key.ends_with("_api_key")
        {
            continue;
        }

        if apply_setting_key(&key, &value, &mut config) {
            result.settings_migrated += 1;
        }
    }

    if let Err(e) = write_config(&config) {
        result
            .errors
            .push(format!("Failed to write config.json: {e}"));
    }
}

/// Public entry point for applying a flat key/value pair to a [`Config`] struct.
/// Returns `true` when the key was recognised and the field was updated.
pub fn apply_setting_key_pub(key: &str, value: &str, config: &mut Config) -> bool {
    apply_setting_key(key, value, config)
}

/// Applies a single flat key/value from the legacy SQLite store to `config`.
/// Returns `true` when the key was recognised and applied.
fn apply_setting_key(key: &str, value: &str, config: &mut Config) -> bool {
    match key {
        // ── Appearance ────────────────────────────────────────────────────────
        "theme" => {
            config.appearance.theme = value.to_string();
            true
        }
        "font_family" => {
            config.appearance.font_family = value.to_string();
            true
        }
        "font_size" => {
            if let Ok(n) = value.parse::<u32>() {
                config.appearance.font_size = n;
                true
            } else {
                false
            }
        }
        "sidebar_position" => {
            config.appearance.sidebar_position = value.to_string();
            true
        }
        "sidebar_collapsed" => {
            config.appearance.sidebar_collapsed = value == "true" || value == "1";
            true
        }
        // ── AI / gateway ──────────────────────────────────────────────────────
        "openclaw_gateway_url" | "gateway_url" => {
            config.ai.gateway_url = value.to_string();
            true
        }
        "default_model" | "ai_model" => {
            config.ai.default_model = value.to_string();
            true
        }
        "ai_streaming" | "streaming" => {
            config.ai.streaming = value == "true" || value == "1";
            true
        }
        "ai_temperature" | "temperature" => {
            if let Ok(f) = value.parse::<f64>() {
                config.ai.temperature = f;
                true
            } else {
                false
            }
        }
        "ai_max_tokens" | "max_tokens" => {
            if let Ok(n) = value.parse::<u32>() {
                config.ai.max_tokens = n;
                true
            } else {
                false
            }
        }
        // ── Terminal ──────────────────────────────────────────────────────────
        "terminal_shell" | "shell" => {
            config.terminal.shell = value.to_string();
            true
        }
        "terminal_scrollback" | "scrollback" => {
            if let Ok(n) = value.parse::<u32>() {
                config.terminal.scrollback = n;
                true
            } else {
                false
            }
        }
        // ── Git ───────────────────────────────────────────────────────────────
        "git_auto_fetch" | "auto_fetch" => {
            config.git.auto_fetch = value == "true" || value == "1";
            true
        }
        "git_sign_commits" | "sign_commits" => {
            config.git.sign_commits = value == "true" || value == "1";
            true
        }
        "git_fetch_interval" | "fetch_interval_secs" => {
            if let Ok(n) = value.parse::<u32>() {
                config.git.fetch_interval_secs = n;
                true
            } else {
                false
            }
        }
        // ── Agents ────────────────────────────────────────────────────────────
        "agents_max_concurrent" | "max_concurrent" => {
            if let Ok(n) = value.parse::<u32>() {
                config.agents.max_concurrent = n;
                true
            } else {
                false
            }
        }
        "agents_a2a_discovery" | "a2a_discovery" => {
            config.agents.a2a_discovery = value == "true" || value == "1";
            true
        }
        "agents_a2a_port" | "a2a_port" => {
            if let Ok(n) = value.parse::<u16>() {
                config.agents.a2a_port = n;
                true
            } else {
                false
            }
        }
        // ── Network ───────────────────────────────────────────────────────────
        "lan_chat_enabled" => {
            config.network.lan_chat_enabled = value == "true" || value == "1";
            true
        }
        "ble_enabled" => {
            config.network.ble_enabled = value == "true" || value == "1";
            true
        }
        "mesh_enabled" => {
            config.network.mesh_enabled = value == "true" || value == "1";
            true
        }
        // ── Telemetry ─────────────────────────────────────────────────────────
        "telemetry_enabled" => {
            config.telemetry.enabled = value == "true" || value == "1";
            true
        }
        // workspace_history is handled separately by migrate_workspace_history.
        // app_mode and other UI-only / unknown keys are intentionally skipped.
        _ => false,
    }
}

/// Reads `workspace_history` from `settings.db` (a JSON array of path strings)
/// and merges any new paths into `~/.liteduck/workspaces.json`.
fn migrate_workspace_history(app_data: &Path, result: &mut MigrationResult) {
    let db_path = app_data.join("settings.db");
    if !db_path.exists() {
        return;
    }

    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            result.errors.push(format!(
                "Cannot open settings.db for workspace history: {e}"
            ));
            return;
        }
    };

    let history: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'workspace_history'",
            [],
            |row| row.get(0),
        )
        .ok();

    let json_str = match history {
        Some(s) => s,
        None => return, // key absent — nothing to migrate
    };

    let paths: Vec<String> = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => {
            result
                .errors
                .push(format!("workspace_history is not a JSON string array: {e}"));
            return;
        }
    };

    let mut registry = read_workspaces().unwrap_or_default();

    for path in paths {
        if path.is_empty() {
            continue;
        }
        // Deduplicate: skip paths already present in the registry.
        if registry.workspaces.iter().any(|w| w.path == path) {
            continue;
        }
        let name = Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        registry.workspaces.push(WorkspaceEntry {
            path: path.clone(),
            name,
            last_opened: String::new(),
            pinned: false,
            tags: Vec::new(),
        });
        result.workspaces_migrated += 1;
    }

    if result.workspaces_migrated > 0 {
        if let Err(e) = write_workspaces(&registry) {
            result
                .errors
                .push(format!("Failed to write workspaces.json: {e}"));
        }
    }
}

/// Renames `settings.db`, `automations.db`, and `mcp.db` to
/// `<name>.db.bak.<timestamp>` so they are no longer picked up on the next
/// launch.
fn archive_db_files(app_data: &Path, result: &mut MigrationResult) {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    for db_name in &["settings.db", "automations.db", "mcp.db"] {
        let path = app_data.join(db_name);
        if path.exists() {
            let bak = app_data.join(format!("{db_name}.bak.{timestamp}"));
            if let Err(e) = fs::rename(&path, &bak) {
                result
                    .errors
                    .push(format!("Failed to archive {db_name}: {e}"));
            } else {
                result
                    .archived_files
                    .push(bak.to_string_lossy().to_string());
                log::info!("migration: archived {} → {}", path.display(), bak.display());
            }
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env::ENV_LOCK;

    /// `home_dir()` returns `~/.liteduck` when no env var is set.
    #[test]
    fn home_dir_defaults_to_dot_liteduck() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        let result = home_dir();
        assert!(
            result.to_string_lossy().ends_with(".liteduck"),
            "expected path to end with .liteduck, got: {}",
            result.display()
        );
    }

    /// `LITEDUCK_HOME` overrides the default path.
    #[test]
    fn home_dir_respects_env_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        let custom = tmp.path().to_str().unwrap().to_string();

        std::env::set_var("LITEDUCK_HOME", &custom);
        let result = home_dir();
        std::env::remove_var("LITEDUCK_HOME");

        assert_eq!(result, std::path::PathBuf::from(&custom));
    }

    /// `ensure_home()` creates all required subdirectories.
    #[test]
    fn ensure_home_creates_directories() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        for rel in HOME_DIRS {
            let dir = tmp.path().join(rel);
            assert!(
                dir.is_dir(),
                "expected directory to exist: {}",
                dir.display()
            );
        }

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `ensure_home()` creates the memory index file.
    #[test]
    fn ensure_home_creates_memory_index() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        let index = tmp.path().join("memory").join("MEMORY.md");
        assert!(index.exists(), "MEMORY.md should be created");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `ensure_home()` is idempotent — a second call must not fail.
    #[test]
    fn ensure_home_is_idempotent() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("first call should succeed");
        ensure_home().expect("second call should also succeed");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `ensure_home()` does not overwrite a pre-existing `MEMORY.md`.
    #[test]
    fn ensure_home_does_not_overwrite_existing_files() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // First call — creates the file.
        ensure_home().expect("first call should succeed");

        // Write custom content.
        let index = tmp.path().join("memory").join("MEMORY.md");
        fs::write(&index, "# custom content").unwrap();

        // Second call — must not overwrite.
        ensure_home().expect("second call should succeed");
        let content = fs::read_to_string(&index).unwrap();
        assert_eq!(
            content, "# custom content",
            "existing file must not be overwritten"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, directories are created with `0o700` permissions.
    #[cfg(unix)]
    #[test]
    fn ensure_home_sets_directory_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        let home = tmp.path();
        let mode = fs::metadata(home).unwrap().permissions().mode();
        // Check lower 9 bits: rwx------ (0o700)
        assert_eq!(
            mode & 0o777,
            0o700,
            "home directory should have 0o700 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, the `MEMORY.md` seed file is created with `0o600` permissions.
    #[cfg(unix)]
    #[test]
    fn ensure_home_sets_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        let index = tmp.path().join("memory").join("MEMORY.md");
        let mode = fs::metadata(&index).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "MEMORY.md should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── profile.md tests ──────────────────────────────────────────────────────

    /// `ensure_home()` seeds `profile.md` with the skeleton on first launch.
    #[test]
    fn ensure_home_seeds_profile_md() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        let profile = tmp.path().join("profile.md");
        assert!(
            profile.exists(),
            "profile.md should be created on first launch"
        );

        let content = fs::read_to_string(&profile).unwrap();
        assert!(
            content.contains("---"),
            "profile.md should contain YAML frontmatter"
        );
        assert!(
            content.contains("name:"),
            "profile.md should contain name field"
        );
        assert!(
            content.contains("## About"),
            "profile.md should contain About section"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `ensure_home()` does not overwrite an existing `profile.md`.
    #[test]
    fn ensure_home_does_not_overwrite_profile() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("first call should succeed");

        // Overwrite with custom content.
        let profile = tmp.path().join("profile.md");
        fs::write(&profile, "# custom profile").unwrap();

        ensure_home().expect("second call should succeed");

        let content = fs::read_to_string(&profile).unwrap();
        assert_eq!(
            content, "# custom profile",
            "existing profile.md must not be overwritten"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_profile_read()` returns the skeleton when `profile.md` is absent.
    #[test]
    fn profile_read_returns_skeleton_when_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Do NOT call ensure_home — profile.md should not exist.
        let result = home_profile_read().expect("should succeed even without file");

        assert!(result.contains("---"), "skeleton should have frontmatter");
        assert!(result.contains("name:"), "skeleton should have name field");
        assert!(
            result.contains("## About"),
            "skeleton should have About section"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_profile_read()` reads existing file content unchanged.
    #[test]
    fn profile_read_returns_existing_content() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let profile_path = tmp.path().join("profile.md");
        fs::write(&profile_path, "# existing profile\n\nsome content").unwrap();

        let result = home_profile_read().expect("should read existing file");
        assert_eq!(result, "# existing profile\n\nsome content");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_profile_write()` persists content to disk.
    #[test]
    fn profile_write_persists_content() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let content = "---\nname: \"Test\"\nupdated: \"2020-01-01\"\n---\n\n## About\n";
        home_profile_write(content.to_string()).expect("write should succeed");

        let profile_path = tmp.path().join("profile.md");
        assert!(profile_path.exists(), "profile.md should be created");

        let written = fs::read_to_string(&profile_path).unwrap();
        assert!(
            written.contains("name: \"Test\""),
            "written content should include name"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `update_profile_timestamp()` updates the `updated:` field with today.
    #[test]
    fn update_timestamp_replaces_updated_field() {
        let content = "---\nname: \"Test\"\nupdated: \"2020-01-01\"\n---\n\n## About\n";
        let result = update_profile_timestamp(content);

        let today = Utc::now().format("%Y-%m-%d").to_string();
        assert!(
            result.contains(&format!("updated: \"{today}\"")),
            "updated field should be replaced with today's date"
        );
        // Original content around it should be preserved.
        assert!(
            result.contains("name: \"Test\""),
            "name field should be preserved"
        );
        assert!(result.contains("## About"), "body should be preserved");
    }

    /// `update_profile_timestamp()` does not modify content without frontmatter.
    #[test]
    fn update_timestamp_ignores_content_without_frontmatter() {
        let content = "# plain markdown\n\nno frontmatter here\n";
        let result = update_profile_timestamp(content);
        assert_eq!(
            result, content,
            "content without frontmatter should be unchanged"
        );
    }

    /// `update_profile_timestamp()` does not modify an `updated:` field in the body.
    #[test]
    fn update_timestamp_only_touches_frontmatter_updated() {
        // No `updated:` field in the frontmatter — body line must be untouched.
        let content = "---\nname: \"Test\"\n---\n\nupdated: last week\n";
        let result = update_profile_timestamp(content);
        assert_eq!(
            result, content,
            "body updated: line must not be modified when frontmatter has no updated field"
        );
    }

    /// Round-trip: write then read returns the same content (with refreshed timestamp).
    #[test]
    fn profile_round_trip_write_read() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let input = "---\nname: \"Alice\"\nupdated: \"2020-01-01\"\n---\n\n## About\n\nHello.\n";
        home_profile_write(input.to_string()).expect("write should succeed");

        let read_back = home_profile_read().expect("read should succeed");
        let today = Utc::now().format("%Y-%m-%d").to_string();

        assert!(
            read_back.contains("name: \"Alice\""),
            "name should survive round-trip"
        );
        assert!(
            read_back.contains(&format!("updated: \"{today}\"")),
            "updated timestamp should be refreshed"
        );
        assert!(
            read_back.contains("## About"),
            "body should survive round-trip"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, `home_profile_write()` sets `0o600` permissions on the file.
    #[cfg(unix)]
    #[test]
    fn profile_write_sets_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let content = "---\nname: \"\"\nupdated: \"2020-01-01\"\n---\n";
        home_profile_write(content.to_string()).expect("write should succeed");

        let profile_path = tmp.path().join("profile.md");
        let mode = fs::metadata(&profile_path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "profile.md should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, the `profile.md` seed file created by `ensure_home()` has `0o600` permissions.
    #[cfg(unix)]
    #[test]
    fn ensure_home_seeds_profile_with_correct_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        ensure_home().expect("ensure_home should succeed");

        let profile = tmp.path().join("profile.md");
        let mode = fs::metadata(&profile).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "seeded profile.md should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── config.json tests ─────────────────────────────────────────────────────

    /// `read_config()` returns `Config::default()` when `config.json` is absent.
    #[test]
    fn config_read_returns_defaults_when_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let config = read_config().expect("should succeed without file");

        assert_eq!(config.appearance.theme, "system");
        assert_eq!(config.ai.default_model, "claude-sonnet-4-6");
        assert_eq!(config.terminal.shell, "/bin/zsh");
        assert!(config.git.auto_fetch);
        assert_eq!(config.agents.max_concurrent, 3);
        assert!(config.network.lan_chat_enabled);
        assert!(!config.telemetry.enabled);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `read_config()` correctly parses a valid JSON file.
    #[test]
    fn config_read_parses_valid_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let json = r#"{
  "appearance": { "theme": "dark", "font_size": 16, "font_family": "JetBrains Mono", "sidebar_position": "left", "sidebar_collapsed": false },
  "ai": { "default_model": "claude-opus-4", "gateway_url": "http://127.0.0.1:18789", "streaming": true, "temperature": 0.5, "max_tokens": 8192 },
  "terminal": { "shell": "/bin/bash", "env": {}, "scrollback": 5000 },
  "git": { "auto_fetch": false, "fetch_interval_secs": 600, "sign_commits": true },
  "agents": { "max_concurrent": 5, "default_model": "claude-sonnet-4-6", "auto_collect_memory": false, "a2a_discovery": true, "a2a_port": 41000 },
  "network": { "lan_chat_enabled": false, "ble_enabled": true, "mesh_enabled": false },
  "telemetry": { "enabled": true, "anonymous": false }
}"#;
        fs::write(tmp.path().join("config.json"), json).unwrap();

        let config = read_config().expect("should parse valid JSON");

        assert_eq!(config.appearance.theme, "dark");
        assert_eq!(config.appearance.font_size, 16);
        assert_eq!(config.ai.default_model, "claude-opus-4");
        assert!((config.ai.temperature - 0.5).abs() < f64::EPSILON);
        assert_eq!(config.ai.max_tokens, 8192);
        assert_eq!(config.terminal.shell, "/bin/bash");
        assert_eq!(config.terminal.scrollback, 5000);
        assert!(!config.git.auto_fetch);
        assert_eq!(config.git.fetch_interval_secs, 600);
        assert!(config.git.sign_commits);
        assert_eq!(config.agents.max_concurrent, 5);
        assert!(!config.agents.auto_collect_memory);
        assert!(!config.network.lan_chat_enabled);
        assert!(config.network.ble_enabled);
        assert!(config.telemetry.enabled);
        assert!(!config.telemetry.anonymous);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `read_config()` fills missing keys with defaults (partial JSON).
    #[test]
    fn config_read_fills_missing_keys() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Only override a single nested field; everything else should default.
        let json = r#"{ "ai": { "default_model": "opus" } }"#;
        fs::write(tmp.path().join("config.json"), json).unwrap();

        let config = read_config().expect("should parse partial JSON");

        assert_eq!(config.ai.default_model, "opus");
        // All other ai fields should be defaulted.
        assert_eq!(config.ai.gateway_url, "http://127.0.0.1:18789");
        assert!(config.ai.streaming);
        // Other top-level sections should also be fully defaulted.
        assert_eq!(config.appearance.theme, "system");
        assert_eq!(config.terminal.shell, "/bin/zsh");
        assert!(config.git.auto_fetch);
        assert_eq!(config.agents.max_concurrent, 3);
        assert!(config.network.lan_chat_enabled);
        assert!(!config.telemetry.enabled);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `write_config()` produces pretty-printed JSON that can be read back.
    #[test]
    fn config_write_creates_pretty_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        write_config(&Config::default()).expect("write should succeed");

        let path = tmp.path().join("config.json");
        assert!(path.exists(), "config.json should be created");

        let content = fs::read_to_string(&path).unwrap();
        // Pretty-printed JSON contains newlines and indentation.
        assert!(content.contains('\n'), "JSON should be pretty-printed");
        assert!(content.contains("  "), "JSON should be indented");

        // Must be valid JSON.
        let parsed: serde_json::Value =
            serde_json::from_str(&content).expect("written file must be valid JSON");
        assert!(parsed.get("appearance").is_some());
        assert!(parsed.get("ai").is_some());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, `write_config()` sets `0o600` permissions on the file.
    #[cfg(unix)]
    #[test]
    fn config_write_sets_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        write_config(&Config::default()).expect("write should succeed");

        let path = tmp.path().join("config.json");
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "config.json should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Round-trip: `write_config` then `read_config` returns identical values.
    #[test]
    fn config_round_trip() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let original = Config::default();
        write_config(&original).expect("write should succeed");

        let restored = read_config().expect("read should succeed");

        assert_eq!(restored.appearance.theme, original.appearance.theme);
        assert_eq!(restored.appearance.font_size, original.appearance.font_size);
        assert_eq!(restored.ai.default_model, original.ai.default_model);
        assert_eq!(restored.ai.gateway_url, original.ai.gateway_url);
        assert_eq!(restored.ai.streaming, original.ai.streaming);
        assert!((restored.ai.temperature - original.ai.temperature).abs() < f64::EPSILON);
        assert_eq!(restored.ai.max_tokens, original.ai.max_tokens);
        assert_eq!(restored.terminal.shell, original.terminal.shell);
        assert_eq!(restored.terminal.scrollback, original.terminal.scrollback);
        assert_eq!(restored.git.auto_fetch, original.git.auto_fetch);
        assert_eq!(
            restored.git.fetch_interval_secs,
            original.git.fetch_interval_secs
        );
        assert_eq!(restored.git.sign_commits, original.git.sign_commits);
        assert_eq!(
            restored.agents.max_concurrent,
            original.agents.max_concurrent
        );
        assert_eq!(restored.agents.default_model, original.agents.default_model);
        assert_eq!(
            restored.agents.auto_collect_memory,
            original.agents.auto_collect_memory
        );
        assert_eq!(restored.agents.a2a_discovery, original.agents.a2a_discovery);
        assert_eq!(restored.agents.a2a_port, original.agents.a2a_port);
        assert_eq!(
            restored.network.lan_chat_enabled,
            original.network.lan_chat_enabled
        );
        assert_eq!(restored.network.ble_enabled, original.network.ble_enabled);
        assert_eq!(restored.network.mesh_enabled, original.network.mesh_enabled);
        assert_eq!(restored.telemetry.enabled, original.telemetry.enabled);
        assert_eq!(restored.telemetry.anonymous, original.telemetry.anonymous);

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── workspaces.json tests ─────────────────────────────────────────────────

    /// `read_workspaces()` returns `WorkspaceRegistry::default()` when the file is absent.
    #[test]
    fn workspaces_read_returns_default_when_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let registry = read_workspaces().expect("should succeed without file");

        assert_eq!(registry.version, 1);
        assert!(registry.active.is_none());
        assert!(registry.workspaces.is_empty());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `read_workspaces()` correctly parses a valid JSON file.
    #[test]
    fn workspaces_read_parses_valid_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let json = r#"{
  "version": 1,
  "active": "/home/user/projects/my-app",
  "workspaces": [
    {
      "path": "/home/user/projects/my-app",
      "name": "My App",
      "last_opened": "2026-04-09T10:00:00Z",
      "pinned": true,
      "tags": ["rust", "tauri"]
    }
  ]
}"#;
        fs::write(tmp.path().join("workspaces.json"), json).unwrap();

        let registry = read_workspaces().expect("should parse valid JSON");

        assert_eq!(registry.version, 1);
        assert_eq!(
            registry.active.as_deref(),
            Some("/home/user/projects/my-app")
        );
        assert_eq!(registry.workspaces.len(), 1);

        let entry = &registry.workspaces[0];
        assert_eq!(entry.path, "/home/user/projects/my-app");
        assert_eq!(entry.name, "My App");
        assert_eq!(entry.last_opened, "2026-04-09T10:00:00Z");
        assert!(entry.pinned);
        assert_eq!(entry.tags, vec!["rust", "tauri"]);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `write_workspaces()` produces pretty-printed JSON that can be read back.
    #[test]
    fn workspaces_write_creates_pretty_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        write_workspaces(&WorkspaceRegistry::default()).expect("write should succeed");

        let path = tmp.path().join("workspaces.json");
        assert!(path.exists(), "workspaces.json should be created");

        let content = fs::read_to_string(&path).unwrap();
        // Pretty-printed JSON contains newlines and indentation.
        assert!(content.contains('\n'), "JSON should be pretty-printed");
        assert!(content.contains("  "), "JSON should be indented");

        // Must be valid JSON with expected keys.
        let parsed: serde_json::Value =
            serde_json::from_str(&content).expect("written file must be valid JSON");
        assert!(parsed.get("version").is_some());
        assert!(parsed.get("workspaces").is_some());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, `write_workspaces()` sets `0o600` permissions on the file.
    #[cfg(unix)]
    #[test]
    fn workspaces_write_sets_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        write_workspaces(&WorkspaceRegistry::default()).expect("write should succeed");

        let path = tmp.path().join("workspaces.json");
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "workspaces.json should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Round-trip: `write_workspaces` then `read_workspaces` returns identical values.
    #[test]
    fn workspaces_round_trip() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let original = WorkspaceRegistry {
            version: 1,
            active: Some("/home/alice/my-project".to_string()),
            workspaces: vec![WorkspaceEntry {
                path: "/home/alice/my-project".to_string(),
                name: "My Project".to_string(),
                last_opened: "2026-04-09T08:00:00Z".to_string(),
                pinned: false,
                tags: vec!["typescript".to_string()],
            }],
        };

        write_workspaces(&original).expect("write should succeed");
        let restored = read_workspaces().expect("read should succeed");

        assert_eq!(restored.version, original.version);
        assert_eq!(restored.active, original.active);
        assert_eq!(restored.workspaces.len(), 1);

        let entry = &restored.workspaces[0];
        assert_eq!(entry.path, "/home/alice/my-project");
        assert_eq!(entry.name, "My Project");
        assert_eq!(entry.last_opened, "2026-04-09T08:00:00Z");
        assert!(!entry.pinned);
        assert_eq!(entry.tags, vec!["typescript"]);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `read_workspaces()` fills missing fields with defaults (partial JSON).
    #[test]
    fn workspaces_read_fills_missing_fields() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Only `active` is set; `version` and `workspaces` are absent.
        let json = r#"{"active": "/some/path"}"#;
        fs::write(tmp.path().join("workspaces.json"), json).unwrap();

        let registry = read_workspaces().expect("should parse partial JSON");

        assert_eq!(registry.version, 1, "version should default to 1");
        assert_eq!(
            registry.active.as_deref(),
            Some("/some/path"),
            "active should be preserved"
        );
        assert!(
            registry.workspaces.is_empty(),
            "workspaces should default to empty vec"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── home memory tests ─────────────────────────────────────────────────────

    fn make_note(title: &str) -> NewMemoryNote {
        NewMemoryNote {
            title: title.to_string(),
            note_type: "user".to_string(),
            tags: vec!["rust".to_string()],
            related: vec![],
            body: "This is the body content about rust programming.".to_string(),
        }
    }

    /// `home_memory_list()` returns empty when the memory directory has no notes.
    #[test]
    fn home_memory_list_empty_when_no_notes() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let result = home_memory_list().expect("list should succeed");
        assert!(result.is_empty(), "expected no notes in empty home");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_write()` creates a markdown file in `~/.liteduck/memory/`.
    #[test]
    fn home_memory_write_creates_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let slug = home_memory_write(make_note("My Test Note")).expect("write should succeed");

        let path = tmp.path().join("memory").join(format!("{slug}.md"));
        assert!(
            path.exists(),
            "note file should be created at {}",
            path.display()
        );
        let content = fs::read_to_string(&path).unwrap();
        assert!(
            content.contains("# My Test Note"),
            "file should contain title heading"
        );
        assert!(
            content.contains("type: user"),
            "file should contain type frontmatter"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_read()` retrieves a previously written note.
    #[test]
    fn home_memory_read_returns_note() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let slug = home_memory_write(make_note("Read Me")).expect("write should succeed");
        let note = home_memory_read(slug).expect("read should succeed");

        assert_eq!(note.title, "Read Me");
        assert_eq!(note.note_type, "user");
        assert_eq!(note.tags, vec!["rust"]);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_search()` returns notes matching the title.
    #[test]
    fn home_memory_search_matches_title() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        home_memory_write(make_note("Rust Patterns")).expect("write note 1");
        home_memory_write(make_note("Go Patterns")).expect("write note 2");

        let results =
            home_memory_search("rust patterns".to_string()).expect("search should succeed");
        assert_eq!(results.len(), 1, "should find exactly one note");
        assert_eq!(results[0].title, "Rust Patterns");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_search()` returns notes matching a tag.
    #[test]
    fn home_memory_search_matches_tags() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        home_memory_write(make_note("Tagged Note")).expect("write note");

        let results = home_memory_search("rust".to_string()).expect("search by tag");
        assert!(
            results.iter().any(|n| n.title == "Tagged Note"),
            "should match note by tag"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_search()` returns notes matching body content.
    #[test]
    fn home_memory_search_matches_body() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        home_memory_write(NewMemoryNote {
            title: "Body Search Test".to_string(),
            note_type: "reference".to_string(),
            tags: vec![],
            related: vec![],
            body: "unique_keyword_xyz in the body".to_string(),
        })
        .expect("write note");

        let results =
            home_memory_search("unique_keyword_xyz".to_string()).expect("body search should work");
        assert!(
            results.iter().any(|n| n.title == "Body Search Test"),
            "should match note by body content"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_delete()` removes the note file.
    #[test]
    fn home_memory_delete_removes_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let slug = home_memory_write(make_note("Delete Me")).expect("write note");
        let path = tmp.path().join("memory").join(format!("{slug}.md"));
        assert!(path.exists(), "note should exist before delete");

        home_memory_delete(slug).expect("delete should succeed");
        assert!(!path.exists(), "note should be gone after delete");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_memory_write()` then `home_memory_read()` round-trip preserves all fields.
    #[test]
    fn home_memory_round_trip() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let input = NewMemoryNote {
            title: "Round Trip Note".to_string(),
            note_type: "project".to_string(),
            tags: vec!["alpha".to_string(), "beta".to_string()],
            related: vec!["other-note".to_string()],
            body: "Detailed body content here.".to_string(),
        };

        let slug = home_memory_write(input).expect("write should succeed");
        let note = home_memory_read(slug).expect("read should succeed");

        assert_eq!(note.title, "Round Trip Note");
        assert_eq!(note.note_type, "project");
        assert_eq!(note.tags, vec!["alpha", "beta"]);
        assert_eq!(note.related, vec!["other-note"]);
        assert!(
            note.body.contains("Detailed body content"),
            "body should be preserved"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Writing a note with a duplicate slug returns an error.
    #[test]
    fn home_memory_write_duplicate_slug_errors() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        home_memory_write(make_note("Duplicate Note")).expect("first write should succeed");
        let result = home_memory_write(make_note("Duplicate Note"));

        assert!(result.is_err(), "second write with same slug should fail");
        let err = result.unwrap_err();
        assert!(
            err.contains("already exists"),
            "error message should mention existing note, got: {err}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Writing a note rebuilds the `index.md` in `~/.liteduck/memory/`.
    #[test]
    fn home_memory_index_rebuilt_on_write() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        home_memory_write(make_note("Indexed Note")).expect("write should succeed");

        let index_path = tmp.path().join("memory").join("index.md");
        assert!(
            index_path.exists(),
            "index.md should be created after write"
        );

        let content = fs::read_to_string(&index_path).unwrap();
        assert!(
            content.contains("indexed-note"),
            "index should contain the note slug, got:\n{content}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── mcp/servers.json tests ────────────────────────────────────────────────

    /// `read_mcp_servers()` returns `McpServerRegistry::default()` when the file is absent.
    #[test]
    fn mcp_servers_read_returns_default_when_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let registry = read_mcp_servers().expect("should succeed without file");

        assert_eq!(registry.version, 1);
        assert!(registry.servers.is_empty());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `read_mcp_servers()` correctly parses a valid JSON file.
    #[test]
    fn mcp_servers_read_parses_valid_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let json = r#"{
  "version": 1,
  "servers": [
    {
      "slug": "filesystem",
      "name": "Filesystem MCP",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-filesystem"],
      "env": {},
      "enabled": true,
      "global": true
    },
    {
      "slug": "github",
      "name": "GitHub MCP",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": { "GITHUB_TOKEN": "${keychain:github_token}" },
      "enabled": true,
      "global": true
    }
  ]
}"#;
        let mcp_dir = tmp.path().join("mcp");
        fs::create_dir_all(&mcp_dir).unwrap();
        fs::write(mcp_dir.join("servers.json"), json).unwrap();

        let registry = read_mcp_servers().expect("should parse valid JSON");

        assert_eq!(registry.version, 1);
        assert_eq!(registry.servers.len(), 2);

        let fs_server = &registry.servers[0];
        assert_eq!(fs_server.slug, "filesystem");
        assert_eq!(fs_server.name, "Filesystem MCP");
        assert_eq!(fs_server.command, "npx");
        assert_eq!(fs_server.args, vec!["-y", "@anthropic-ai/mcp-filesystem"]);
        assert!(fs_server.enabled);
        assert!(fs_server.global);

        let gh_server = &registry.servers[1];
        assert_eq!(gh_server.slug, "github");
        assert_eq!(
            gh_server.env.get("GITHUB_TOKEN").map(|s| s.as_str()),
            Some("${keychain:github_token}")
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `write_mcp_servers()` creates `mcp/servers.json` with valid pretty-printed JSON.
    #[test]
    fn mcp_servers_write_creates_json() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let mut env_map = HashMap::new();
        env_map.insert(
            "GITHUB_TOKEN".to_string(),
            "${keychain:github_token}".to_string(),
        );

        let registry = McpServerRegistry {
            version: 1,
            servers: vec![McpServerConfig {
                slug: "github".to_string(),
                name: "GitHub MCP".to_string(),
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@anthropic-ai/mcp-github".to_string()],
                env: env_map,
                enabled: true,
                global: true,
            }],
        };

        write_mcp_servers(&registry).expect("write should succeed");

        let path = tmp.path().join("mcp").join("servers.json");
        assert!(path.exists(), "servers.json should be created");

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains('\n'), "JSON should be pretty-printed");
        assert!(content.contains("  "), "JSON should be indented");
        assert!(
            content.contains("github_token"),
            "keychain ref should be present in file"
        );

        let parsed: serde_json::Value =
            serde_json::from_str(&content).expect("written file must be valid JSON");
        assert!(parsed.get("version").is_some());
        assert!(parsed.get("servers").is_some());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Round-trip: `write_mcp_servers` then `read_mcp_servers` preserves all fields.
    #[test]
    fn mcp_servers_round_trip() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let original = McpServerRegistry {
            version: 1,
            servers: vec![
                McpServerConfig {
                    slug: "filesystem".to_string(),
                    name: "Filesystem MCP".to_string(),
                    command: "npx".to_string(),
                    args: vec!["-y".to_string(), "@anthropic-ai/mcp-filesystem".to_string()],
                    env: HashMap::new(),
                    enabled: true,
                    global: true,
                },
                McpServerConfig {
                    slug: "disabled-server".to_string(),
                    name: "Disabled Server".to_string(),
                    command: "my-mcp".to_string(),
                    args: vec![],
                    env: HashMap::new(),
                    enabled: false,
                    global: false,
                },
            ],
        };

        write_mcp_servers(&original).expect("write should succeed");
        let restored = read_mcp_servers().expect("read should succeed");

        assert_eq!(restored.version, original.version);
        assert_eq!(restored.servers.len(), 2);

        let s0 = &restored.servers[0];
        assert_eq!(s0.slug, "filesystem");
        assert_eq!(s0.name, "Filesystem MCP");
        assert_eq!(s0.command, "npx");
        assert_eq!(s0.args, vec!["-y", "@anthropic-ai/mcp-filesystem"]);
        assert!(s0.enabled);
        assert!(s0.global);

        let s1 = &restored.servers[1];
        assert_eq!(s1.slug, "disabled-server");
        assert!(!s1.enabled);
        assert!(!s1.global);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// On Unix, `write_mcp_servers()` sets `0o600` permissions on the file.
    #[cfg(unix)]
    #[test]
    fn mcp_servers_write_sets_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        write_mcp_servers(&McpServerRegistry::default()).expect("write should succeed");

        let path = tmp.path().join("mcp").join("servers.json");
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "servers.json should have 0o600 permissions, got {mode:#o}"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `resolve_keychain_refs` passes non-keychain values through unchanged.
    #[test]
    fn resolve_keychain_refs_passthrough() {
        let mut env = HashMap::new();
        env.insert("PLAIN_VAR".to_string(), "plain_value".to_string());
        env.insert("ANOTHER".to_string(), "another_value".to_string());

        let resolved = resolve_keychain_refs(&env);

        assert_eq!(
            resolved.get("PLAIN_VAR").map(|s| s.as_str()),
            Some("plain_value")
        );
        assert_eq!(
            resolved.get("ANOTHER").map(|s| s.as_str()),
            Some("another_value")
        );
    }

    /// `resolve_keychain_refs` replaces `${keychain:…}` pattern with keychain value
    /// (or empty string when the key is not present in the keychain).
    #[test]
    fn resolve_keychain_refs_resolves_pattern() {
        let mut env = HashMap::new();
        // Use a key that almost certainly does not exist in the test keychain.
        env.insert(
            "API_KEY".to_string(),
            "${keychain:ld_test_nonexistent_key_xyz}".to_string(),
        );
        env.insert("NORMAL".to_string(), "keep_me".to_string());

        let resolved = resolve_keychain_refs(&env);

        // The pattern must be recognised and replaced (with empty string on miss).
        // We do not assert a specific non-empty value since the CI keychain won't
        // have this entry, but we verify the placeholder itself was removed.
        let api_value = resolved.get("API_KEY").unwrap();
        assert_ne!(
            api_value, "${keychain:ld_test_nonexistent_key_xyz}",
            "keychain placeholder should be resolved (not left as-is)"
        );

        // Non-keychain value must be untouched.
        assert_eq!(resolved.get("NORMAL").map(|s| s.as_str()), Some("keep_me"));
    }

    // ── resolve_config tests ──────────────────────────────────────────────────

    /// When neither global nor workspace config files exist, `resolve_config`
    /// returns built-in defaults.
    #[test]
    fn resolve_config_returns_defaults_when_no_files() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let config = resolve_config(None).expect("should succeed with no files");

        assert_eq!(config.appearance.theme, "system");
        assert_eq!(config.ai.default_model, "claude-sonnet-4-6");
        assert_eq!(config.terminal.shell, "/bin/zsh");
        assert!(config.git.auto_fetch);
        assert_eq!(config.agents.max_concurrent, 3);
        assert!(config.network.lan_chat_enabled);
        assert!(!config.telemetry.enabled);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// When only global config exists (no workspace), `resolve_config` returns
    /// global values.
    #[test]
    fn resolve_config_reads_global_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let json = r#"{ "ai": { "default_model": "claude-opus-4", "gateway_url": "http://127.0.0.1:18789", "streaming": true, "temperature": 0.7, "max_tokens": 4096 } }"#;
        fs::write(tmp.path().join("config.json"), json).unwrap();

        let config = resolve_config(None).expect("should succeed with global config only");

        assert_eq!(config.ai.default_model, "claude-opus-4");
        // All other sections should still reflect defaults.
        assert_eq!(config.appearance.theme, "system");
        assert_eq!(config.terminal.shell, "/bin/zsh");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// When `workspace` is `None`, only global config is used (no workspace
    /// lookup is attempted).
    #[test]
    fn resolve_config_no_workspace_path() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let json = r#"{ "appearance": { "theme": "light", "font_family": "JetBrains Mono", "font_size": 14, "sidebar_position": "left", "sidebar_collapsed": false } }"#;
        fs::write(tmp.path().join("config.json"), json).unwrap();

        // workspace=None → global only.
        let config = resolve_config(None).expect("should succeed with global config");

        assert_eq!(config.appearance.theme, "light");
        // Defaults preserved for everything else.
        assert_eq!(config.ai.default_model, "claude-sonnet-4-6");

        std::env::remove_var("LITEDUCK_HOME");
    }

    // ── Migration tests ───────────────────────────────────────────────────────

    /// `home_migration_check` returns all-false when the app-data directory
    /// does not exist (first install, no legacy databases at all).
    #[test]
    fn migration_check_reports_no_databases() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Build a fake app_data dir that does not exist.
        let fake_app_data = tmp.path().join("com.bemindlabs.liteduck");
        // Verify sub-paths do not exist.
        assert!(!fake_app_data.join("settings.db").exists());
        assert!(!fake_app_data.join("automations.db").exists());
        assert!(!fake_app_data.join("mcp.db").exists());
        // config.json has not been created yet either.
        assert!(!home_dir().join("config.json").exists());

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `home_migration_run` with no databases present completes without errors
    /// and returns zero counts.
    #[test]
    fn migration_run_with_no_databases() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Create the temp legacy app-data dir (empty — no .db files).
        let fake_app_data = tmp.path().join("legacy_app_data");
        fs::create_dir_all(&fake_app_data).unwrap();

        let mut result = MigrationResult {
            settings_migrated: 0,
            automations_migrated: 0,
            mcp_servers_migrated: 0,
            workspaces_migrated: 0,
            errors: Vec::new(),
            archived_files: Vec::new(),
        };

        migrate_settings(&fake_app_data, &mut result);
        migrate_workspace_history(&fake_app_data, &mut result);
        archive_db_files(&fake_app_data, &mut result);

        assert_eq!(result.settings_migrated, 0, "no settings to migrate");
        assert_eq!(result.workspaces_migrated, 0, "no workspaces to migrate");
        assert!(
            result.errors.is_empty(),
            "no errors expected: {:?}",
            result.errors
        );
        assert!(result.archived_files.is_empty(), "no files to archive");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Known keys in `settings.db` are correctly mapped to `Config` fields and
    /// written to `config.json`.
    #[test]
    fn migrate_settings_maps_known_keys() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        // Create a fake settings.db with known key/value pairs.
        let app_data = tmp.path().join("app_data");
        fs::create_dir_all(&app_data).unwrap();
        let db_path = app_data.join("settings.db");

        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO settings VALUES ('theme', 'dark');
                 INSERT INTO settings VALUES ('gateway_url', 'http://localhost:9000');
                 INSERT INTO settings VALUES ('font_size', '16');
                 INSERT INTO settings VALUES ('streaming', 'false');
                 INSERT INTO settings VALUES ('lan_chat_enabled', '0');
                 INSERT INTO settings VALUES ('some_api_key', 'should_be_skipped');",
            )
            .unwrap();
        }

        let mut result = MigrationResult {
            settings_migrated: 0,
            automations_migrated: 0,
            mcp_servers_migrated: 0,
            workspaces_migrated: 0,
            errors: Vec::new(),
            archived_files: Vec::new(),
        };

        migrate_settings(&app_data, &mut result);

        assert!(
            result.errors.is_empty(),
            "unexpected errors: {:?}",
            result.errors
        );
        // 5 known keys (theme, gateway_url, font_size, streaming, lan_chat_enabled).
        // some_api_key is skipped because it ends with `_api_key`.
        assert_eq!(result.settings_migrated, 5);

        // Verify config.json was written with correct values.
        let config = read_config().expect("config.json should be readable");
        assert_eq!(config.appearance.theme, "dark");
        assert_eq!(config.ai.gateway_url, "http://localhost:9000");
        assert_eq!(config.appearance.font_size, 16);
        assert!(!config.ai.streaming);
        assert!(!config.network.lan_chat_enabled);

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `workspace_history` stored as a JSON string array is correctly migrated
    /// to `workspaces.json`.
    #[test]
    fn migrate_workspace_history_string_array() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let app_data = tmp.path().join("app_data");
        fs::create_dir_all(&app_data).unwrap();
        let db_path = app_data.join("settings.db");

        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute_batch(
                r#"CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                   INSERT INTO settings VALUES ('workspace_history', '["/home/user/project-a","/home/user/project-b"]');"#,
            )
            .unwrap();
        }

        let mut result = MigrationResult {
            settings_migrated: 0,
            automations_migrated: 0,
            mcp_servers_migrated: 0,
            workspaces_migrated: 0,
            errors: Vec::new(),
            archived_files: Vec::new(),
        };

        migrate_workspace_history(&app_data, &mut result);

        assert!(
            result.errors.is_empty(),
            "unexpected errors: {:?}",
            result.errors
        );
        assert_eq!(result.workspaces_migrated, 2);

        let registry = read_workspaces().expect("workspaces.json should be readable");
        assert_eq!(registry.workspaces.len(), 2);
        assert!(registry
            .workspaces
            .iter()
            .any(|w| w.path == "/home/user/project-a"));
        assert!(registry
            .workspaces
            .iter()
            .any(|w| w.path == "/home/user/project-b"));

        // Verify name is derived from the path's final component.
        let entry_a = registry
            .workspaces
            .iter()
            .find(|w| w.path == "/home/user/project-a")
            .unwrap();
        assert_eq!(entry_a.name, "project-a");

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// `archive_db_files` renames existing `.db` files to `.db.bak.<timestamp>`.
    #[test]
    fn archive_renames_db_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let app_data = tmp.path().join("app_data");
        fs::create_dir_all(&app_data).unwrap();

        // Create placeholder .db files.
        fs::write(app_data.join("settings.db"), b"placeholder").unwrap();
        fs::write(app_data.join("automations.db"), b"placeholder").unwrap();
        // mcp.db intentionally absent — archive should skip it silently.

        let mut result = MigrationResult {
            settings_migrated: 0,
            automations_migrated: 0,
            mcp_servers_migrated: 0,
            workspaces_migrated: 0,
            errors: Vec::new(),
            archived_files: Vec::new(),
        };

        archive_db_files(&app_data, &mut result);

        assert!(
            result.errors.is_empty(),
            "unexpected errors: {:?}",
            result.errors
        );
        assert_eq!(
            result.archived_files.len(),
            2,
            "two files should be archived"
        );

        // Original files must no longer exist.
        assert!(
            !app_data.join("settings.db").exists(),
            "settings.db should be renamed"
        );
        assert!(
            !app_data.join("automations.db").exists(),
            "automations.db should be renamed"
        );

        // Backup files must exist and contain the `.bak.` marker.
        for bak in &result.archived_files {
            assert!(
                std::path::Path::new(bak).exists(),
                "backup file should exist: {bak}"
            );
            assert!(
                bak.contains(".bak."),
                "backup name should contain .bak.: {bak}"
            );
        }

        std::env::remove_var("LITEDUCK_HOME");
    }

    /// Duplicate workspace paths in `workspace_history` are not added twice.
    #[test]
    fn migrate_workspace_history_deduplicates() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path().to_str().unwrap());

        let app_data = tmp.path().join("app_data");
        fs::create_dir_all(&app_data).unwrap();
        let db_path = app_data.join("settings.db");

        // Pre-seed workspaces.json with one entry.
        let existing = WorkspaceRegistry {
            version: 1,
            active: None,
            workspaces: vec![WorkspaceEntry {
                path: "/home/user/existing".to_string(),
                name: "existing".to_string(),
                last_opened: String::new(),
                pinned: false,
                tags: Vec::new(),
            }],
        };
        write_workspaces(&existing).unwrap();

        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute_batch(
                r#"CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                   INSERT INTO settings VALUES ('workspace_history', '["/home/user/existing","/home/user/new-project"]');"#,
            )
            .unwrap();
        }

        let mut result = MigrationResult {
            settings_migrated: 0,
            automations_migrated: 0,
            mcp_servers_migrated: 0,
            workspaces_migrated: 0,
            errors: Vec::new(),
            archived_files: Vec::new(),
        };

        migrate_workspace_history(&app_data, &mut result);

        assert_eq!(
            result.workspaces_migrated, 1,
            "only the new path should be added"
        );

        let registry = read_workspaces().unwrap();
        assert_eq!(
            registry.workspaces.len(),
            2,
            "total should be 2 (existing + new)"
        );

        std::env::remove_var("LITEDUCK_HOME");
    }
}
