//! LiteDuck plugin system — runtime for the **Hybrid: declarative manifest +
//! shell command** model (design note `2026-05-28_plugin-system-design.md`,
//! option 4).
//!
//! A plugin is a folder under `~/.liteduck/plugins/<id>/` containing a
//! `plugin.json` manifest. The host loads no plugin code into its own address
//! space — a plugin's only surfaces are (1) the manifest schema and (2) the
//! stdin/stdout contract of the shell command each contributed command spawns.
//! Plugins run as subprocesses with the user's privileges ("user-trust v1").
//!
//! ## Charter reconciliation
//! LiteDuck core has no AI/LLM and no integrations; integrations live in
//! PLUGINS, never in core. This module is the sanctioned extension point. To
//! keep ADR-001 enforced *by the schema rather than by review discipline*, the
//! loader applies a **scope-ceiling deny-list**: any manifest whose `kind` is
//! `chat`, `agent`, or `llm` is refused at load time with a clear rejection.
//!
//! ## Lazy, not auto-load
//! Nothing is scanned on startup. The frontend calls [`plugin_list`] (and the
//! other commands) on demand, mirroring LiteDuck's existing lazy patterns.
//!
//! ## Sandbox boundary (v1)
//! Subprocess plugins inherit the user's full privileges. The manifest must
//! explicitly declare `network` and the host `paths` it needs; the install
//! confirmation UI surfaces those. There is **no** real OS sandbox in v1 — that
//! is a documented future phase.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

// ── Schema ──────────────────────────────────────────────────────────────────

/// Allowed contribution kinds. A plugin must declare exactly one. The set is an
/// allow-list (not a deny-list) so the charter is enforced by what we *do*
/// accept, with [`DENIED_KINDS`] as a redundant, explicit second gate.
pub const ALLOWED_KINDS: &[&str] = &["integration", "formatter", "linter", "previewer", "tool"];

/// Scope-ceiling deny-list (design note Q7 = ON). Even if one of these ever
/// slipped past the allow-list, the loader refuses to load it. These are the
/// kinds that would reintroduce out-of-charter LoopDuck surface area.
pub const DENIED_KINDS: &[&str] = &["chat", "agent", "llm"];

/// A single command a plugin contributes. `run` is a shell template the host
/// spawns via `sh -c`. Parameters passed from the UI are exported as
/// `LITEDUCK_PARAM_<UPPERCASE_KEY>` env vars (never string-interpolated into the
/// template — that avoids shell-injection through user input).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginCommand {
    pub id: String,
    pub title: String,
    /// Shell command template executed via `sh -c`.
    pub run: String,
    /// Declared parameter keys this command accepts (documentation + UI hints).
    #[serde(default)]
    pub args: Vec<String>,
    /// Declarative-view hint for how the command's stdout should be rendered:
    /// `text` (default) | `table` | `list` | `keyvalue` | `markdown`. Absent or
    /// unknown values are treated as `text` by the frontend renderer. The host
    /// never interprets this — it only passes it through (no plugin JS/HTML
    /// executes; `view` only selects a *built-in* renderer over plugin data).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view: Option<String>,
    /// When `true`, this command is auto-run as the plugin's landing view when
    /// its page is opened. At most one command per plugin should set this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<bool>,
}

/// A parsed `plugin.json` manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    /// Contribution kind — validated against [`ALLOWED_KINDS`] / [`DENIED_KINDS`].
    pub kind: String,
    #[serde(default)]
    pub commands: Vec<PluginCommand>,
    /// Whether the plugin needs network access. Declared, surfaced in install UI.
    #[serde(default)]
    pub network: bool,
    /// Host filesystem scopes the plugin declares it needs. Declared + surfaced;
    /// not OS-enforced in v1 (user-trust). A real sandbox is a future phase.
    #[serde(default)]
    pub paths: Vec<String>,
    /// Declarative workspace surface for the plugin: `panel` (default — appears
    /// inside the Plugins panel master-detail) or `page` (opens full-width in the
    /// editor-area slot like Git/Settings). The host never interprets this beyond
    /// passing it through; it only selects which *built-in* container renders the
    /// plugin's declarative views (no plugin JS/HTML executes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    /// Name of a host-provided icon (from LiteDuck's built-in lucide set) for the
    /// activity rail. A plugin only *names* an icon — it never ships an SVG/asset.
    /// Unknown/absent names fall back to the generic plugin icon on the frontend.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// When `true`, the plugin gets its own icon in the activity rail (below the
    /// shared Plugins icon) that opens its page directly. Opt-in to avoid rail
    /// clutter; absent → `false`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
    /// Optional **executable UI** entry (ADR-002 / `2026-05-28_plugin-ui-host-design.md`).
    /// When present, the frontend renders the plugin through the isolated UI host
    /// (a sandboxed, opaque-origin iframe) using the named bundle instead of the
    /// built-in declarative views. Absent → declarative (backward compatible). The
    /// Rust side only declares + serves the bundle; it never executes plugin code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<PluginUi>,
}

/// Executable-UI descriptor for a plugin (ADR-002). The bundle is a single,
/// self-contained ES module shipped in the plugin directory; LiteDuck loads it
/// into a sandboxed iframe with no access to the host or the Tauri bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginUi {
    /// Bundle filename relative to the plugin directory (e.g. `ui.js`). Must be a
    /// bare filename — path separators / `..` are rejected when the bundle is read.
    pub entry: String,
    /// Optional height hint for panel surfaces (`full` or a px value). Page
    /// surfaces fill the editor area regardless.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<String>,
    /// What to do if the bundle fails to load: `declarative` falls back to the
    /// built-in views. Absent → `declarative`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,
}

/// An installed plugin: its manifest plus the resolved on-disk directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    #[serde(flatten)]
    pub manifest: PluginManifest,
    /// Absolute path to the plugin's directory under `~/.liteduck/plugins/`.
    pub dir: String,
}

/// Result of running a plugin command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginRunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

// ── Registry (GitHub) ─────────────────────────────────────────────────────────

/// The official published plugin registry repo: `bemindlabs/liteduck-plugins`.
const REGISTRY_REPO: &str = "bemindlabs/liteduck-plugins";
/// Default branch the registry + plugin files are read from.
const REGISTRY_BRANCH: &str = "main";

/// Default registry URL — the raw `registry.json` on the official repo's main
/// branch. Overridable per-call so a fork/private mirror can be pointed at.
const DEFAULT_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/bemindlabs/liteduck-plugins/main/registry.json";

/// User-Agent sent on every GitHub request (GitHub's API rejects requests with
/// no UA).
const USER_AGENT: &str = "LiteDuck-Plugins";

/// Hosts network egress is permitted to. Any `download_url` the Contents API
/// returns must resolve to one of these — we never follow a redirect to an
/// arbitrary host.
const ALLOWED_HOSTS: &[&str] = &["raw.githubusercontent.com", "api.github.com"];

/// A single entry in the registry's `plugins` array. Mirrors the published
/// `registry.json` schema. Unknown fields are ignored; absent optional fields
/// default so a slightly newer registry still parses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub author: String,
    /// Relative source path within the repo, e.g. `plugins/<id>/`.
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub verified: bool,
    /// Whether the plugin ships an **executable UI** (ADR-002) — surfaced in the
    /// install UI so the user consents to running plugin code (isolated, but
    /// still third-party) before installing.
    #[serde(default)]
    pub ui: bool,
}

/// The parsed top-level `registry.json` document.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegistryDoc {
    #[serde(default)]
    schema_version: serde_json::Value,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    plugins: Vec<RegistryEntry>,
}

/// One file entry as returned by the GitHub Contents API.
#[derive(Debug, Clone, Deserialize)]
struct ContentsEntry {
    name: String,
    /// `"file"` or `"dir"`.
    #[serde(rename = "type")]
    entry_type: String,
    /// Raw download URL (`null` for directories).
    download_url: Option<String>,
}

// ── Path resolution ───────────────────────────────────────────────────────────

/// `~/.liteduck/plugins` — the plugins root. Reuses [`crate::home::home_dir`]
/// for `$LITEDUCK_HOME` resolution so tests and overrides behave consistently.
pub fn plugins_dir() -> PathBuf {
    crate::home::home_dir().join("plugins")
}

// ── Validation ────────────────────────────────────────────────────────────────

/// Validate a manifest against the allow-list / deny-list. The deny-list check
/// runs first and is the scope-ceiling enforcement (design note Q7).
fn validate_manifest(m: &PluginManifest) -> Result<(), String> {
    let kind = m.kind.trim().to_lowercase();

    // Scope-ceiling deny-list: refuse out-of-charter kinds outright.
    if DENIED_KINDS.contains(&kind.as_str()) {
        return Err(format!(
            "plugin '{}' declares kind '{}', which is on the scope-ceiling deny-list \
             (chat/agent/llm are out of charter — LiteDuck core has no AI/LLM). Refusing to load.",
            m.id, m.kind
        ));
    }

    // Allow-list: only known contribution kinds are accepted.
    if !ALLOWED_KINDS.contains(&kind.as_str()) {
        return Err(format!(
            "plugin '{}' declares unknown kind '{}'. Allowed kinds: {}.",
            m.id,
            m.kind,
            ALLOWED_KINDS.join(", ")
        ));
    }

    if m.id.trim().is_empty() {
        return Err("plugin manifest is missing a non-empty 'id'".to_string());
    }
    // Defense against path traversal via a hostile id (used to build a dir path).
    if m.id.contains('/') || m.id.contains('\\') || m.id.contains("..") {
        return Err(format!(
            "plugin id '{}' is invalid: it must not contain path separators or '..'",
            m.id
        ));
    }

    Ok(())
}

/// Parse + validate a single `plugin.json` at `path`.
fn load_manifest(path: &Path) -> Result<PluginManifest, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let manifest: PluginManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

// ── Inner logic (testable, no Tauri) ───────────────────────────────────────────

/// Scan `~/.liteduck/plugins/*/plugin.json` and return the valid installed
/// plugins. Invalid manifests (including deny-listed ones) are skipped with a
/// logged warning rather than failing the whole scan — one bad plugin must not
/// hide the rest.
pub fn list_plugins_inner() -> Result<Vec<InstalledPlugin>, String> {
    let root = plugins_dir();
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let entries =
        fs::read_dir(&root).map_err(|e| format!("Failed to read {}: {e}", root.display()))?;

    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }
        match load_manifest(&manifest_path) {
            Ok(manifest) => out.push(InstalledPlugin {
                manifest,
                dir: dir.to_string_lossy().to_string(),
            }),
            Err(e) => log::warn!("Skipping plugin at {}: {e}", dir.display()),
        }
    }

    out.sort_by(|a, b| a.manifest.id.cmp(&b.manifest.id));
    Ok(out)
}

/// A user-data file captured from an existing install so a reinstall doesn't
/// nuke the user's edits (e.g. `auth.toml` with real credentials). Top-level
/// only; subdirectory user-data isn't a current convention.
struct PreservedUserData {
    filename: String,
    bytes: Vec<u8>,
    /// Unix permission bits to restore (0 = use the OS default).
    mode: u32,
}

/// Read the existing-install manifest's declared `paths` and capture any
/// non-empty top-level user-data files (e.g. `auth.toml`) so they survive a
/// reinstall's wipe-and-copy. A best-effort read — any failure (no manifest,
/// unreadable file) just returns an empty list and the reinstall proceeds.
fn collect_user_data_to_preserve(dest: &Path) -> Vec<PreservedUserData> {
    let Ok(text) = fs::read_to_string(dest.join("plugin.json")) else {
        return Vec::new();
    };
    let Ok(manifest) = serde_json::from_str::<PluginManifest>(&text) else {
        return Vec::new();
    };
    let mut saved = Vec::new();
    for declared in &manifest.paths {
        // Take just the filename — paths typically point inside the plugin dir
        // (`~/.liteduck/plugins/<id>/auth.toml`), and only top-level user-data
        // is supported. Subdirectory user-data isn't a current convention.
        let Some(name) = Path::new(declared).file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let path = dest.join(name);
        if !path.is_file() {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if bytes.is_empty() {
            // Never restore a placeholder over an incoming real file.
            continue;
        }
        saved.push(PreservedUserData {
            filename: name.to_string(),
            bytes,
            mode: unix_mode(&path),
        });
    }
    saved
}

/// Write captured user-data files back into the freshly-copied plugin dir,
/// restoring their original permissions. A best-effort step: a write failure is
/// logged but never aborts the reinstall (the rest of the plugin is already in
/// place; the user can re-add the missing credential by hand).
fn restore_user_data(dest: &Path, saved: Vec<PreservedUserData>) {
    for item in saved {
        let path = dest.join(&item.filename);
        if let Err(e) = fs::write(&path, &item.bytes) {
            log::warn!("failed to restore user-data {}: {e}", path.display());
            continue;
        }
        if item.mode != 0 {
            apply_unix_mode(&path, item.mode);
        }
    }
}

#[cfg(unix)]
fn unix_mode(p: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(p).map(|m| m.permissions().mode()).unwrap_or(0)
}
#[cfg(not(unix))]
fn unix_mode(_p: &Path) -> u32 {
    0
}

#[cfg(unix)]
fn apply_unix_mode(p: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(p, fs::Permissions::from_mode(mode));
}
#[cfg(not(unix))]
fn apply_unix_mode(_p: &Path, _mode: u32) {}

/// Copy a plugin folder at `source` into `~/.liteduck/plugins/<id>/`.
///
/// The source must contain a valid `plugin.json`. The destination id is taken
/// from the (validated) manifest, never from the source folder name. Returns
/// the freshly-installed plugin.
///
/// **User-data preservation:** when reinstalling over an existing plugin, any
/// top-level file named in the *existing* manifest's `paths` (e.g. `auth.toml`)
/// is captured before the wipe and restored after the copy — so a reinstall
/// never silently nukes the user's filled-in credentials.
pub fn install_plugin_inner(source: &str) -> Result<InstalledPlugin, String> {
    let src = PathBuf::from(source);
    if !src.is_dir() {
        return Err(format!("install source is not a directory: {source}"));
    }
    let src_manifest = src.join("plugin.json");
    if !src_manifest.exists() {
        return Err(format!("no plugin.json found in {source}"));
    }
    // Validate BEFORE copying anything — deny-listed plugins never touch disk.
    let manifest = load_manifest(&src_manifest)?;

    let root = plugins_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create plugins dir: {e}"))?;
    let dest = root.join(&manifest.id);

    let preserved = if dest.exists() {
        let p = collect_user_data_to_preserve(&dest);
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to replace existing plugin '{}': {e}", manifest.id))?;
        p
    } else {
        Vec::new()
    };
    copy_dir_recursive(&src, &dest)?;
    restore_user_data(&dest, preserved);

    Ok(InstalledPlugin {
        manifest,
        dir: dest.to_string_lossy().to_string(),
    })
}

// ── Registry fetch + install ──────────────────────────────────────────────────

/// Build a blocking HTTP client with a User-Agent + short timeout. Redirects
/// are disabled so a registry host can never bounce us to an arbitrary origin —
/// every URL we hit is checked against [`ALLOWED_HOSTS`] up front.
fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Reject any URL whose host is not in [`ALLOWED_HOSTS`]. This caps network
/// egress to the GitHub registry + raw hosts even when the registry document
/// (or the Contents API) hands us a `download_url`.
fn assert_allowed_host(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid URL '{url}': {e}"))?;
    match parsed.host_str() {
        Some(host) if ALLOWED_HOSTS.contains(&host) => Ok(()),
        Some(host) => Err(format!(
            "refusing to fetch from disallowed host '{host}' (only {} are permitted)",
            ALLOWED_HOSTS.join(", ")
        )),
        None => Err(format!("URL '{url}' has no host")),
    }
}

/// Map a reqwest response status into a friendly error, calling out the GitHub
/// unauthenticated rate limit (60 req/hr) explicitly so the UI can show it.
fn status_error(context: &str, status: reqwest::StatusCode) -> String {
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS
    {
        format!(
            "{context}: GitHub returned {} — likely the unauthenticated API rate limit \
             (60 requests/hour). Try again later.",
            status.as_u16()
        )
    } else {
        format!("{context}: GitHub returned status {}", status.as_u16())
    }
}

/// Fetch + parse `registry.json`. `registry_url` overrides the official default.
pub fn registry_fetch_inner(registry_url: Option<&str>) -> Result<Vec<RegistryEntry>, String> {
    let url = registry_url.unwrap_or(DEFAULT_REGISTRY_URL);
    assert_allowed_host(url)?;

    let client = http_client()?;
    let resp = client
        .get(url)
        .send()
        .map_err(|e| format!("Failed to fetch registry: {e}"))?;
    if !resp.status().is_success() {
        return Err(status_error("Failed to fetch registry", resp.status()));
    }
    let text = resp
        .text()
        .map_err(|e| format!("Failed to read registry body: {e}"))?;
    let doc: RegistryDoc =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse registry.json: {e}"))?;
    Ok(doc.plugins)
}

/// List a directory in the registry repo via the GitHub Contents API.
fn list_contents(
    client: &reqwest::blocking::Client,
    repo_path: &str,
) -> Result<Vec<ContentsEntry>, String> {
    let url = format!(
        "https://api.github.com/repos/{REGISTRY_REPO}/contents/{repo_path}?ref={REGISTRY_BRANCH}"
    );
    assert_allowed_host(&url)?;
    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("Failed to list {repo_path}: {e}"))?;
    if !resp.status().is_success() {
        return Err(status_error(
            &format!("Failed to list '{repo_path}'"),
            resp.status(),
        ));
    }
    resp.json::<Vec<ContentsEntry>>()
        .map_err(|e| format!("Failed to parse Contents API response for '{repo_path}': {e}"))
}

/// Fetch the raw bytes of a single file `download_url` (host-checked).
fn fetch_file_bytes(
    client: &reqwest::blocking::Client,
    download_url: &str,
) -> Result<Vec<u8>, String> {
    assert_allowed_host(download_url)?;
    let resp = client
        .get(download_url)
        .send()
        .map_err(|e| format!("Failed to download {download_url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(status_error(
            &format!("Failed to download '{download_url}'"),
            resp.status(),
        ));
    }
    resp.bytes()
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read bytes from {download_url}: {e}"))
}

/// Recursively download a Contents API directory into `dest_dir`, preserving the
/// exec bit on `.sh` files. Handles one or more levels of nesting (`type=="dir"`
/// recurses) — current plugins are flat, but a subdir won't crash.
fn download_contents_into(
    client: &reqwest::blocking::Client,
    repo_path: &str,
    dest_dir: &Path,
) -> Result<(), String> {
    fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Failed to create {}: {e}", dest_dir.display()))?;
    let entries = list_contents(client, repo_path)?;
    for entry in entries {
        match entry.entry_type.as_str() {
            "file" => {
                let url = entry
                    .download_url
                    .ok_or_else(|| format!("file '{}' has no download_url", entry.name))?;
                let bytes = fetch_file_bytes(client, &url)?;
                let dest = dest_dir.join(&entry.name);
                fs::write(&dest, &bytes)
                    .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;
                preserve_exec_bit(&dest);
            }
            "dir" => {
                let sub_repo_path = format!("{repo_path}/{}", entry.name);
                let sub_dest = dest_dir.join(&entry.name);
                download_contents_into(client, &sub_repo_path, &sub_dest)?;
            }
            // Ignore symlinks/submodules — out of scope for flat plugin dirs.
            other => log::warn!(
                "skipping unsupported Contents entry '{}' (type '{other}')",
                entry.name
            ),
        }
    }
    Ok(())
}

/// Install a plugin straight from the GitHub registry repo.
///
/// Flow (security-critical ordering):
///   1. Resolve the registry entry → its `source` path (default `plugins/<id>/`).
///   2. **Fetch + validate the `plugin.json` manifest FIRST.** It is parsed and
///      run through [`validate_manifest`] (the scope-ceiling deny-list) before
///      *any* file is written to `~/.liteduck/plugins/`. A deny-listed or
///      malformed plugin therefore leaves no trace on disk.
///   3. Download every file in the source dir into a staging directory under
///      the plugins root (`.staging-<id>`), preserving the `.sh` exec bit.
///   4. Atomically move staging → `~/.liteduck/plugins/<id>/`, overwriting any
///      existing install (reinstall/upgrade semantics).
pub fn install_from_registry_inner(
    plugin_id: &str,
    registry_url: Option<&str>,
) -> Result<InstalledPlugin, String> {
    // Guard the id early — it builds both a repo path and a dest dir path.
    if plugin_id.trim().is_empty()
        || plugin_id.contains('/')
        || plugin_id.contains('\\')
        || plugin_id.contains("..")
    {
        return Err(format!("invalid plugin id '{plugin_id}'"));
    }

    // Resolve the plugin's source path from the registry (falls back to the
    // conventional layout when the entry omits it or the fetch fails).
    let source_path = match registry_fetch_inner(registry_url) {
        Ok(entries) => entries
            .into_iter()
            .find(|e| e.id == plugin_id)
            .map(|e| e.source)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("plugins/{plugin_id}")),
        Err(_) => format!("plugins/{plugin_id}"),
    };
    // Normalise: strip a trailing slash so Contents API paths are clean.
    let source_path = source_path.trim_end_matches('/').to_string();

    let client = http_client()?;

    // ── Step 1: fetch + validate plugin.json BEFORE writing anything ──────────
    let manifest_url = format!("{source_path}/plugin.json");
    let entries = list_contents(&client, &source_path)?;
    let manifest_entry = entries
        .iter()
        .find(|e| e.entry_type == "file" && e.name == "plugin.json")
        .ok_or_else(|| format!("no plugin.json found in registry source '{manifest_url}'"))?;
    let manifest_dl = manifest_entry
        .download_url
        .clone()
        .ok_or_else(|| "plugin.json has no download_url".to_string())?;
    let manifest_bytes = fetch_file_bytes(&client, &manifest_dl)?;
    let manifest: PluginManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("Failed to parse fetched plugin.json: {e}"))?;
    // The critical security gate — runs before any disk write below.
    validate_manifest(&manifest)?;
    // The registry id and the manifest id must agree (defence-in-depth: the
    // dest dir is derived from the validated manifest, never the request).
    if manifest.id != plugin_id {
        return Err(format!(
            "registry id '{plugin_id}' does not match the fetched manifest id '{}'",
            manifest.id
        ));
    }

    // ── Step 2: stage all files under the plugins root, then move atomically ──
    let root = plugins_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create plugins dir: {e}"))?;
    let staging = root.join(format!(".staging-{}", manifest.id));
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    // Download into staging; clean up on any failure so a partial fetch never
    // becomes a half-installed plugin.
    if let Err(e) = download_contents_into(&client, &source_path, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    let dest = root.join(&manifest.id);
    // Capture user-data (e.g. auth.toml with real creds) from the existing
    // install before the wipe, then restore after the atomic swap.
    let preserved = if dest.exists() {
        let p = collect_user_data_to_preserve(&dest);
        if let Err(e) = fs::remove_dir_all(&dest) {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!(
                "Failed to replace existing plugin '{}': {e}",
                manifest.id
            ));
        }
        p
    } else {
        Vec::new()
    };
    fs::rename(&staging, &dest).map_err(|e| {
        let _ = fs::remove_dir_all(&staging);
        format!("Failed to install plugin '{}': {e}", manifest.id)
    })?;
    restore_user_data(&dest, preserved);

    Ok(InstalledPlugin {
        manifest,
        dir: dest.to_string_lossy().to_string(),
    })
}

/// Remove `~/.liteduck/plugins/<id>/`.
pub fn uninstall_plugin_inner(id: &str) -> Result<(), String> {
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(format!("invalid plugin id '{id}'"));
    }
    let dir = plugins_dir().join(id);
    if !dir.exists() {
        return Err(format!("plugin '{id}' is not installed"));
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("Failed to uninstall '{id}': {e}"))?;
    Ok(())
}

/// Gate the plugin UI `open-external` capability (ADR-002 Phase 3b). Checks the
/// plugin-id shape + the URL scheme before resolving the manifest so the cheap
/// rejections are testable without a real install. Allowed only when:
///   • the URL is `https://` (no `http`, `file:`, `javascript:`, opaque schemes),
///   • the plugin is installed, and
///   • its manifest declares `network: true` (the capability the install consent
///     surfaced). The shell-command sandbox is unchanged: nothing else is granted.
pub fn validate_open_external(plugin_id: &str, url: &str) -> Result<(), String> {
    if plugin_id.is_empty()
        || plugin_id.contains('/')
        || plugin_id.contains('\\')
        || plugin_id.contains("..")
    {
        return Err(format!("invalid plugin id '{plugin_id}'"));
    }
    // Case-insensitive scheme check — and *only* https:// (no protocol-relative
    // `//foo`, no `http://`). Length guard avoids absurd payloads.
    if url.len() > 4096 {
        return Err("url too long".to_string());
    }
    let lower = url.to_ascii_lowercase();
    if !lower.starts_with("https://") {
        return Err(format!("open-external only allows https:// URLs (got: {url})"));
    }
    let plugin = list_plugins_inner()?
        .into_iter()
        .find(|p| p.manifest.id == plugin_id)
        .ok_or_else(|| format!("plugin '{plugin_id}' is not installed"))?;
    if !plugin.manifest.network {
        return Err(format!(
            "plugin '{plugin_id}' does not declare `network: true` — open-external denied"
        ));
    }
    Ok(())
}

// ── Plugin UI host (`plugin://` custom scheme — ADR-002) ──────────────────────
//
// A plugin's executable UI is served from a SEPARATE origin (the `plugin://`
// custom scheme) so it is cross-origin to the host app (cannot reach the host
// DOM or the Tauri `invoke` bridge) and runs under its OWN restrictive CSP set
// on the response — never the host window's CSP. The host↔plugin contract is a
// versioned `postMessage` bridge (the bootstrap below); the host validates every
// `run-command` against the plugin's declared commands. This mirrors VS Code's
// `vscode-webview://` design (see `notes/2026-05-28_plugin-ui-host-design.md`).

/// CSP applied to every `plugin://` response. `connect-src 'none'` denies the
/// frame any network; `'unsafe-inline'` is scoped to this isolated origin only
/// (it never touches the host window CSP) so the host-authored bootstrap can run.
/// Script/img/font sources are named by **scheme** (`plugin:` / `http://plugin.localhost`)
/// rather than `'self'` because the frame is `sandbox`ed to an **opaque origin**
/// (Phase 2 hardening), where `'self'` would no longer match the plugin's own URLs.
const PLUGIN_FRAME_CSP: &str =
    "default-src 'none'; script-src 'unsafe-inline' plugin: http://plugin.localhost; \
style-src 'unsafe-inline'; img-src plugin: http://plugin.localhost data:; \
font-src plugin: http://plugin.localhost data:; connect-src 'none'; \
base-uri 'none'; form-action 'none'";

const PLUGIN_SHELL_CSS: &str =
    "html,body{margin:0;height:100%;color-scheme:light dark}\
     body{font:13px/1.5 -apple-system,system-ui,sans-serif}";

/// Host-authored bridge bootstrap injected into every plugin UI shell. Exposes a
/// minimal `window.liteduck` (runCommand/log + context) that talks to the host
/// over `postMessage`; the plugin's own bundle loads after it and uses that API.
const PLUGIN_BOOTSTRAP_JS: &str = r#"
(function(){
  var seq=0, pending={};
  window.liteduck={
    context:null,
    runCommand:function(commandId,params){
      var id=String(++seq);
      return new Promise(function(resolve){
        pending[id]=resolve;
        parent.postMessage({v:1,type:'run-command',payload:{requestId:id,commandId:commandId,params:params||{}}},'*');
      });
    },
    log:function(level,msg){ parent.postMessage({v:1,type:'log',payload:{level:level,msg:String(msg)}},'*'); },
    openExternal:function(url){ parent.postMessage({v:1,type:'open-external',payload:{url:String(url)}},'*'); }
  };
  window.addEventListener('message',function(e){
    var m=e.data; if(!m||m.v!==1) return;
    if(m.type==='init'){ window.liteduck.context=m.payload.context;
      if(typeof window.liteduck.onContext==='function'){ try{window.liteduck.onContext(m.payload.context);}catch(_){} } }
    else if(m.type==='command-result'){ var r=pending[m.payload.requestId];
      if(r){ delete pending[m.payload.requestId]; r(m.payload); } }
  });
  parent.postMessage({v:1,type:'ready'},'*');
})();
"#;

/// A resolved `plugin://` asset response (status + content-type + per-response
/// CSP + bytes). Pure/host-agnostic so it is unit-testable without Tauri's http
/// types; `lib.rs` maps it onto `http::Response`.
#[derive(Debug, Clone)]
pub struct PluginAssetResponse {
    pub status: u16,
    pub content_type: String,
    pub csp: String,
    pub body: Vec<u8>,
}

fn plugin_asset_not_found(msg: &str) -> PluginAssetResponse {
    PluginAssetResponse {
        status: 404,
        content_type: "text/plain; charset=utf-8".to_string(),
        csp: PLUGIN_FRAME_CSP.to_string(),
        body: msg.as_bytes().to_vec(),
    }
}

fn plugin_shell_html(entry: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<style>{css}</style></head><body><div id=\"app\"></div>\
<script>{boot}</script>\
<script src=\"./{entry}\"></script></body></html>",
        css = PLUGIN_SHELL_CSS,
        boot = PLUGIN_BOOTSTRAP_JS,
        entry = entry,
    )
}

/// Resolve a `plugin://localhost/<id>/<file?>` request to a response. Serves the
/// host-authored shell HTML for `/<id>/` (or `index.html`) and the plugin's
/// declared `ui.entry` bundle for `/<id>/<entry>`. Everything else (and any
/// path-traversal / undeclared file) is 404. The bundle is only *read* — the
/// host never executes plugin code; the isolated frame does.
pub fn resolve_plugin_asset(path: &str) -> PluginAssetResponse {
    let trimmed = path.trim_start_matches('/');
    let mut parts = trimmed.splitn(2, '/');
    let plugin_id = parts.next().unwrap_or("");
    let rest = parts.next().unwrap_or("");
    if plugin_id.is_empty() || plugin_id.contains("..") || plugin_id.contains('\\') {
        return plugin_asset_not_found("invalid plugin id");
    }
    let plugin = match list_plugins_inner() {
        Ok(ps) => ps.into_iter().find(|p| p.manifest.id == plugin_id),
        Err(_) => None,
    };
    let Some(plugin) = plugin else {
        return plugin_asset_not_found("plugin not installed");
    };
    let Some(ui) = plugin.manifest.ui.as_ref() else {
        return plugin_asset_not_found("plugin declares no UI bundle");
    };
    let entry = ui.entry.as_str();
    if entry.is_empty() || entry.contains('/') || entry.contains('\\') || entry.contains("..") {
        return plugin_asset_not_found("invalid ui entry");
    }

    if rest.is_empty() || rest == "index.html" {
        return PluginAssetResponse {
            status: 200,
            content_type: "text/html; charset=utf-8".to_string(),
            csp: PLUGIN_FRAME_CSP.to_string(),
            body: plugin_shell_html(entry).into_bytes(),
        };
    }
    if rest == entry {
        let file = PathBuf::from(&plugin.dir).join(entry);
        return match fs::read(&file) {
            Ok(body) => PluginAssetResponse {
                status: 200,
                content_type: "text/javascript; charset=utf-8".to_string(),
                csp: PLUGIN_FRAME_CSP.to_string(),
                body,
            },
            Err(e) => plugin_asset_not_found(&format!("failed to read bundle: {e}")),
        };
    }
    plugin_asset_not_found("not found")
}

/// Run a plugin's contributed command. The command's `run` template is spawned
/// via `sh -c`. Caller-supplied `params` are exported as `LITEDUCK_PARAM_<KEY>`
/// env vars (uppercased) — never interpolated into the shell string, to keep
/// user input off the command line.
///
/// `workspace` is the directory LiteDuck currently has open. When it is a
/// non-empty, existing directory the child process runs with that as its CWD
/// (so CWD-based resolution works for workspace-scoped tools like `bwoc`, `git`,
/// …) and `LITEDUCK_WORKSPACE` is exported so scripts can read it explicitly.
/// When `workspace` is absent or invalid the CWD falls back to the plugin's own
/// directory (legacy behavior). The plugin dir is always exported as
/// `LITEDUCK_PLUGIN_DIR` so a plugin can locate its bundled files regardless of
/// which CWD is in effect.
pub fn run_command_inner(
    plugin_id: &str,
    command_id: &str,
    params: &HashMap<String, String>,
    workspace: Option<&str>,
) -> Result<PluginRunResult, String> {
    let plugins = list_plugins_inner()?;
    let plugin = plugins
        .into_iter()
        .find(|p| p.manifest.id == plugin_id)
        .ok_or_else(|| format!("plugin '{plugin_id}' is not installed"))?;

    let cmd = plugin
        .manifest
        .commands
        .iter()
        .find(|c| c.id == command_id)
        .ok_or_else(|| format!("plugin '{plugin_id}' has no command '{command_id}'"))?;

    let mut command = Command::new("sh");
    command.arg("-c").arg(&cmd.run);
    // The plugin dir is always discoverable via this env var even when the CWD
    // is the active workspace, so a plugin can still find its bundled files.
    command.env("LITEDUCK_PLUGIN_DIR", &plugin.dir);

    // Prefer the active workspace as CWD when it is a real, existing directory;
    // otherwise fall back to the plugin's own directory (legacy behavior).
    let workspace_dir = workspace
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .filter(|w| Path::new(w).is_dir());
    match workspace_dir {
        Some(ws) => {
            command.current_dir(ws);
            command.env("LITEDUCK_WORKSPACE", ws);
        }
        None => {
            command.current_dir(&plugin.dir);
        }
    }

    for (key, value) in params {
        let env_key = format!(
            "LITEDUCK_PARAM_{}",
            key.to_uppercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '_' })
                .collect::<String>()
        );
        command.env(env_key, value);
    }

    let output = command
        .output()
        .map_err(|e| format!("Failed to spawn plugin command '{command_id}': {e}"))?;

    Ok(PluginRunResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// On Unix, set the executable bit (`0o755`) on `path` when it is a `*.sh`
/// script so the shell template can invoke it directly. No-op on non-Unix and
/// for non-`.sh` files.
fn preserve_exec_bit(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if path.extension().and_then(|e| e.to_str()) == Some("sh") {
            let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o755));
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// Recursively copy `src` into `dst`. On Unix, `*.sh` scripts get the executable
/// bit so the shell template can invoke them directly.
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {e}", dst.display()))?;
    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))?;
    for entry in entries.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| format!("Failed to copy {}: {e}", from.display()))?;
            preserve_exec_bit(&to);
        }
    }
    Ok(())
}

// ── Tauri commands ──────────────────────────────────────────────────────────────

/// List installed plugins (`~/.liteduck/plugins/*/plugin.json`). Lazy — invoked
/// from the frontend on demand, never on startup.
#[tauri::command]
pub fn plugin_list() -> Result<Vec<InstalledPlugin>, String> {
    list_plugins_inner()
}

/// Install a plugin from a local folder (chosen via the dialog plugin in the UI).
#[tauri::command]
pub fn plugin_install(path: String) -> Result<InstalledPlugin, String> {
    install_plugin_inner(&path)
}

/// Uninstall a plugin by id.
#[tauri::command]
pub fn plugin_uninstall(id: String) -> Result<(), String> {
    uninstall_plugin_inner(&id)
}

/// Run a plugin's contributed command with optional params. `workspace` is the
/// directory LiteDuck currently has open; when present it becomes the child's
/// CWD (and is exported as `LITEDUCK_WORKSPACE`) so workspace-scoped tools like
/// `bwoc` resolve the open workspace instead of the plugin's install dir.
#[tauri::command]
pub fn plugin_run_command(
    plugin_id: String,
    command_id: String,
    params: Option<HashMap<String, String>>,
    workspace: Option<String>,
) -> Result<PluginRunResult, String> {
    run_command_inner(
        &plugin_id,
        &command_id,
        &params.unwrap_or_default(),
        workspace.as_deref(),
    )
}

/// Open an external URL on behalf of a plugin's UI (ADR-002 capability grant).
/// Validates via [`validate_open_external`] before delegating to the system
/// opener — only `https://` URLs and only plugins that declared `network: true`.
#[tauri::command]
pub fn plugin_open_external(
    app: tauri::AppHandle,
    plugin_id: String,
    url: String,
) -> Result<(), String> {
    validate_open_external(&plugin_id, &url)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("failed to open url: {e}"))
}

/// Fetch the published plugin registry (`registry.json`) and return its entries.
/// `registry_url` overrides the official default
/// (`bemindlabs/liteduck-plugins@main`). Read-only — no disk writes.
#[tauri::command]
pub fn plugin_registry_fetch(registry_url: Option<String>) -> Result<Vec<RegistryEntry>, String> {
    registry_fetch_inner(registry_url.as_deref())
}

/// Install a plugin straight from the GitHub registry repo by id. The manifest
/// is fetched + validated (scope-ceiling deny-list) BEFORE any file is written
/// to `~/.liteduck/plugins/`. Reinstalls/upgrades overwrite an existing copy.
#[tauri::command]
pub fn plugin_install_from_registry(
    plugin_id: String,
    registry_url: Option<String>,
) -> Result<InstalledPlugin, String> {
    install_from_registry_inner(&plugin_id, registry_url.as_deref())
}

// ── Tests ───────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env::ENV_LOCK;

    fn write_manifest(dir: &Path, id: &str, json: &str) {
        let pdir = dir.join(id);
        fs::create_dir_all(&pdir).unwrap();
        fs::write(pdir.join("plugin.json"), json).unwrap();
    }

    #[test]
    fn command_view_and_default_parse_through() {
        // A manifest declaring `view` + `default` on a command parses, and the
        // fields survive a round-trip back to JSON (frontend passthrough).
        let m: PluginManifest = serde_json::from_str(
            r#"{"id":"x","name":"X","version":"1","kind":"integration",
                "commands":[{"id":"x.list","title":"List","run":"echo hi",
                             "view":"table","default":true}]}"#,
        )
        .unwrap();
        let cmd = &m.commands[0];
        assert_eq!(cmd.view.as_deref(), Some("table"));
        assert_eq!(cmd.default, Some(true));

        // Absent → None for both (back-compat: behaves like text, no auto-run).
        let m2: PluginManifest = serde_json::from_str(
            r#"{"id":"y","name":"Y","version":"1","kind":"tool",
                "commands":[{"id":"y.run","title":"Run","run":"echo hi"}]}"#,
        )
        .unwrap();
        assert_eq!(m2.commands[0].view, None);
        assert_eq!(m2.commands[0].default, None);

        // Round-trip: serialized JSON includes the set fields, omits the absent.
        let json = serde_json::to_string(cmd).unwrap();
        assert!(json.contains("\"view\":\"table\""), "got: {json}");
        assert!(json.contains("\"default\":true"), "got: {json}");
        let json2 = serde_json::to_string(&m2.commands[0]).unwrap();
        assert!(!json2.contains("view"), "absent view should be omitted: {json2}");
        assert!(!json2.contains("default"), "absent default should be omitted: {json2}");
    }

    #[test]
    fn surface_icon_pinned_parse_through() {
        // A manifest declaring plugin-level surface/icon/pinned parses, and the
        // fields survive a round-trip back to JSON (frontend passthrough).
        let m: PluginManifest = serde_json::from_str(
            r#"{"id":"bwoc","name":"BWOC","version":"1","kind":"integration",
                "surface":"page","icon":"users","pinned":true}"#,
        )
        .unwrap();
        assert_eq!(m.surface.as_deref(), Some("page"));
        assert_eq!(m.icon.as_deref(), Some("users"));
        assert_eq!(m.pinned, Some(true));

        // Absent → None for all three (back-compat: panel surface, no rail icon).
        let m2: PluginManifest =
            serde_json::from_str(r#"{"id":"y","name":"Y","version":"1","kind":"tool"}"#).unwrap();
        assert_eq!(m2.surface, None);
        assert_eq!(m2.icon, None);
        assert_eq!(m2.pinned, None);

        // Round-trip: serialized JSON includes the set fields, omits the absent.
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"surface\":\"page\""), "got: {json}");
        assert!(json.contains("\"icon\":\"users\""), "got: {json}");
        assert!(json.contains("\"pinned\":true"), "got: {json}");
        let json2 = serde_json::to_string(&m2).unwrap();
        assert!(!json2.contains("surface"), "absent surface omitted: {json2}");
        assert!(!json2.contains("icon"), "absent icon omitted: {json2}");
        assert!(!json2.contains("pinned"), "absent pinned omitted: {json2}");
    }

    #[test]
    fn ui_entry_parses_through() {
        // A manifest declaring a plugin-level `ui` entry parses + round-trips
        // (ADR-002). Absent → None (back-compat: declarative rendering).
        let m: PluginManifest = serde_json::from_str(
            r#"{"id":"bwoc","name":"BWOC","version":"1","kind":"integration",
                "ui":{"entry":"ui.js","fallback":"declarative"}}"#,
        )
        .unwrap();
        let ui = m.ui.as_ref().expect("ui present");
        assert_eq!(ui.entry, "ui.js");
        assert_eq!(ui.fallback.as_deref(), Some("declarative"));

        let m2: PluginManifest =
            serde_json::from_str(r#"{"id":"y","name":"Y","version":"1","kind":"tool"}"#).unwrap();
        assert!(m2.ui.is_none());

        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"ui\""), "got: {json}");
        let json2 = serde_json::to_string(&m2).unwrap();
        assert!(!json2.contains("\"ui\""), "absent ui omitted: {json2}");
    }

    #[test]
    fn resolve_plugin_asset_rejects_traversal_and_unknown() {
        // The id guard fires before any filesystem access (no home override
        // needed): traversal in the id, and an unknown plugin, both 404.
        for bad in ["/../etc/passwd", "/..\\x/", "/"] {
            let r = resolve_plugin_asset(bad);
            assert_eq!(r.status, 404, "path {bad:?} should 404");
        }
        // A well-formed but not-installed id resolves to a 404, never a file.
        let r = resolve_plugin_asset("/definitely-not-installed/ui.js");
        assert_eq!(r.status, 404);
        // Every response carries the locked-down plugin-frame CSP.
        assert!(r.csp.contains("connect-src 'none'"), "csp: {}", r.csp);
        assert!(r.csp.contains("default-src 'none'"), "csp: {}", r.csp);
    }

    #[test]
    fn reinstall_preserves_user_data_declared_in_paths() {
        // Reinstalling over an existing install must NOT clobber user-edited
        // files declared in the manifest's `paths` (e.g. auth.toml with real
        // credentials). Top-level only.
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());

        // v1: install a plugin that declares auth.toml as user-data + ships an
        // empty placeholder for it.
        let src1 = tempfile::tempdir().unwrap();
        fs::write(
            src1.path().join("plugin.json"),
            r#"{"id":"acme","name":"Acme","version":"1","kind":"integration",
                "paths":["~/.liteduck/plugins/acme/auth.toml"]}"#,
        )
        .unwrap();
        fs::write(src1.path().join("auth.toml"), "").unwrap();
        let installed = install_plugin_inner(src1.path().to_str().unwrap()).unwrap();

        // User fills auth.toml with their real creds (mode 600).
        let auth_path = PathBuf::from(&installed.dir).join("auth.toml");
        fs::write(&auth_path, "email=\"a@b\"\ntoken=\"REAL\"\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&auth_path, fs::Permissions::from_mode(0o600)).unwrap();
        }

        // v2: reinstall from a fresh source that again ships an empty
        // placeholder auth.toml — the user's real one MUST survive.
        let src2 = tempfile::tempdir().unwrap();
        fs::write(
            src2.path().join("plugin.json"),
            r#"{"id":"acme","name":"Acme","version":"2","kind":"integration",
                "paths":["~/.liteduck/plugins/acme/auth.toml"]}"#,
        )
        .unwrap();
        fs::write(src2.path().join("auth.toml"), "").unwrap();
        install_plugin_inner(src2.path().to_str().unwrap()).unwrap();

        let after = fs::read_to_string(&auth_path).unwrap();
        assert!(after.contains("REAL"), "user creds were clobbered: {after:?}");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&auth_path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "permissions on preserved file were lost");
        }

        std::env::remove_var("LITEDUCK_HOME");
    }

    #[test]
    fn validate_open_external_cheap_rejections() {
        // The id-shape + URL-scheme checks fire before any filesystem access,
        // so they're testable without an installed plugin / home override.
        assert!(validate_open_external("../bad", "https://example.com")
            .unwrap_err()
            .contains("invalid plugin id"));
        assert!(validate_open_external("ok", "http://example.com")
            .unwrap_err()
            .contains("https://"));
        assert!(validate_open_external("ok", "javascript:alert(1)")
            .unwrap_err()
            .contains("https://"));
        assert!(validate_open_external("ok", "//example.com")
            .unwrap_err()
            .contains("https://"));
        let huge = format!("https://{}", "a".repeat(5000));
        assert!(validate_open_external("ok", &huge).unwrap_err().contains("too long"));
    }

    #[test]
    fn plugin_shell_html_embeds_entry_and_bootstrap() {
        let html = plugin_shell_html("ui.js");
        assert!(html.contains("src=\"./ui.js\""), "shell must load the entry: {html}");
        assert!(html.contains("window.liteduck"), "shell must include the bridge bootstrap");
        assert!(html.contains("type='run-command'") || html.contains("run-command"));
    }

    #[test]
    fn allowed_kind_loads() {
        let m: PluginManifest =
            serde_json::from_str(r#"{"id":"x","name":"X","version":"1","kind":"integration"}"#)
                .unwrap();
        assert!(validate_manifest(&m).is_ok());
    }

    #[test]
    fn denied_kind_is_refused() {
        for kind in DENIED_KINDS {
            let m: PluginManifest = serde_json::from_str(&format!(
                r#"{{"id":"x","name":"X","version":"1","kind":"{kind}"}}"#
            ))
            .unwrap();
            let err = validate_manifest(&m).unwrap_err();
            assert!(
                err.contains("deny-list"),
                "kind {kind} should be denied: {err}"
            );
        }
    }

    #[test]
    fn unknown_kind_is_rejected() {
        let m: PluginManifest =
            serde_json::from_str(r#"{"id":"x","name":"X","version":"1","kind":"wat"}"#).unwrap();
        assert!(validate_manifest(&m).unwrap_err().contains("unknown kind"));
    }

    #[test]
    fn id_with_traversal_is_rejected() {
        let m: PluginManifest =
            serde_json::from_str(r#"{"id":"../evil","name":"X","version":"1","kind":"tool"}"#)
                .unwrap();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn list_skips_denied_and_invalid() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());
        let root = plugins_dir();
        fs::create_dir_all(&root).unwrap();

        write_manifest(
            &root,
            "good",
            r#"{"id":"good","name":"G","version":"1","kind":"tool"}"#,
        );
        write_manifest(
            &root,
            "bad",
            r#"{"id":"bad","name":"B","version":"1","kind":"agent"}"#,
        );

        let list = list_plugins_inner().unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        assert_eq!(list.len(), 1);
        assert_eq!(list[0].manifest.id, "good");
    }

    #[test]
    fn run_command_passes_params_as_env() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());
        let root = plugins_dir();
        fs::create_dir_all(&root).unwrap();
        write_manifest(
            &root,
            "echoer",
            r#"{"id":"echoer","name":"E","version":"1","kind":"tool",
                "commands":[{"id":"hi","title":"Hi","run":"printf '%s' \"$LITEDUCK_PARAM_NAME\""}]}"#,
        );

        let mut params = HashMap::new();
        params.insert("name".to_string(), "duck".to_string());
        let res = run_command_inner("echoer", "hi", &params, None).unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        assert_eq!(res.exit_code, 0);
        assert_eq!(res.stdout, "duck");
    }

    #[test]
    fn run_command_uses_workspace_as_cwd_when_valid() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());
        let root = plugins_dir();
        fs::create_dir_all(&root).unwrap();
        // The command echoes its CWD + the workspace env var so we can assert
        // both the current_dir() and LITEDUCK_WORKSPACE wiring.
        write_manifest(
            &root,
            "pwd",
            r#"{"id":"pwd","name":"P","version":"1","kind":"tool",
                "commands":[{"id":"where","title":"Where","run":"pwd; printf '%s' \"$LITEDUCK_WORKSPACE\""}]}"#,
        );

        // A real, existing workspace dir distinct from the plugin's install dir.
        let ws = tempfile::tempdir().unwrap();
        let ws_path = ws.path().canonicalize().unwrap();
        let params = HashMap::new();
        let res =
            run_command_inner("pwd", "where", &params, Some(ws_path.to_str().unwrap())).unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        assert_eq!(res.exit_code, 0);
        // CWD line (first) resolves to the workspace, and LITEDUCK_WORKSPACE is set.
        let cwd_line = res.stdout.lines().next().unwrap_or("");
        assert_eq!(
            std::fs::canonicalize(cwd_line).unwrap(),
            ws_path,
            "CWD should be the active workspace, got: {}",
            res.stdout
        );
        assert!(
            res.stdout.contains(ws_path.to_str().unwrap()),
            "LITEDUCK_WORKSPACE should be exported, got: {}",
            res.stdout
        );
    }

    #[test]
    fn run_command_falls_back_to_plugin_dir_when_workspace_missing() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());
        let root = plugins_dir();
        fs::create_dir_all(&root).unwrap();
        write_manifest(
            &root,
            "pwd2",
            r#"{"id":"pwd2","name":"P","version":"1","kind":"tool",
                "commands":[{"id":"where","title":"Where","run":"pwd; printf '%s' \"$LITEDUCK_WORKSPACE\""}]}"#,
        );
        let plugin_dir = plugins_dir().join("pwd2").canonicalize().unwrap();
        let params = HashMap::new();

        // None workspace → CWD is the plugin dir, LITEDUCK_WORKSPACE unset.
        let res = run_command_inner("pwd2", "where", &params, None).unwrap();
        assert_eq!(res.exit_code, 0);
        let cwd_line = res.stdout.lines().next().unwrap_or("");
        assert_eq!(std::fs::canonicalize(cwd_line).unwrap(), plugin_dir);

        // A non-existent / empty workspace path also falls back to the plugin dir.
        let res2 =
            run_command_inner("pwd2", "where", &params, Some("/no/such/dir/at/all")).unwrap();
        let res3 = run_command_inner("pwd2", "where", &params, Some("   ")).unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        let cwd2 = res2.stdout.lines().next().unwrap_or("");
        let cwd3 = res3.stdout.lines().next().unwrap_or("");
        assert_eq!(std::fs::canonicalize(cwd2).unwrap(), plugin_dir);
        assert_eq!(std::fs::canonicalize(cwd3).unwrap(), plugin_dir);
    }

    #[test]
    fn registry_doc_parses_official_schema() {
        // Mirrors the published registry.json shape, including a slightly newer
        // unknown top-level field to confirm forward-compat parsing.
        let json = r#"{
            "schemaVersion": 1,
            "updatedAt": "2026-05-28T00:00:00Z",
            "extraFutureField": true,
            "plugins": [
                {"id":"jira","name":"Jira","version":"1.0.0","description":"Jira integration",
                 "kind":"integration","network":true,"author":"bemindlabs",
                 "source":"plugins/jira/","tags":["issues"],"verified":true},
                {"id":"bwoc","name":"BWOC","version":"0.1.0","description":"BWOC bridge",
                 "kind":"integration","network":false,"author":"bemindlabs",
                 "source":"plugins/bwoc/","tags":[],"verified":false}
            ]
        }"#;
        let doc: RegistryDoc = serde_json::from_str(json).unwrap();
        assert_eq!(doc.plugins.len(), 2);
        let jira = &doc.plugins[0];
        assert_eq!(jira.id, "jira");
        assert!(jira.network);
        assert!(jira.verified);
        assert_eq!(jira.source, "plugins/jira/");
        let bwoc = &doc.plugins[1];
        assert!(!bwoc.network);
        assert!(!bwoc.verified);
    }

    #[test]
    fn registry_entry_tolerates_missing_optional_fields() {
        let entry: RegistryEntry =
            serde_json::from_str(r#"{"id":"min","name":"Minimal"}"#).unwrap();
        assert_eq!(entry.id, "min");
        assert!(entry.version.is_empty());
        assert!(!entry.verified);
        assert!(entry.tags.is_empty());
    }

    #[test]
    fn allowed_host_gate_accepts_github_and_rejects_others() {
        assert!(assert_allowed_host(
            "https://raw.githubusercontent.com/bemindlabs/liteduck-plugins/main/registry.json"
        )
        .is_ok());
        assert!(assert_allowed_host(
            "https://api.github.com/repos/bemindlabs/liteduck-plugins/contents/plugins/jira"
        )
        .is_ok());
        // A non-GitHub host (and a sneaky look-alike) must be refused.
        assert!(assert_allowed_host("https://evil.example.com/plugin.json").is_err());
        assert!(assert_allowed_host("https://raw.githubusercontent.com.evil.com/x").is_err());
    }

    #[test]
    fn install_from_registry_rejects_bad_id_without_network() {
        // A traversal id is rejected before any HTTP call is made.
        let err = install_from_registry_inner("../evil", None).unwrap_err();
        assert!(err.contains("invalid plugin id"), "got: {err}");
    }

    #[test]
    fn manifest_gate_refuses_denied_kind_from_fetched_bytes() {
        // Simulates the validate-before-write gate on fetched manifest bytes:
        // a deny-listed kind must error out before any file would be written.
        let bytes = br#"{"id":"sneaky","name":"S","version":"1","kind":"agent"}"#;
        let manifest: PluginManifest = serde_json::from_slice(bytes).unwrap();
        let err = validate_manifest(&manifest).unwrap_err();
        assert!(err.contains("deny-list"), "got: {err}");
    }

    #[test]
    fn install_then_uninstall_roundtrip() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LITEDUCK_HOME", tmp.path());

        // Build a source folder elsewhere.
        let src = tempfile::tempdir().unwrap();
        fs::write(
            src.path().join("plugin.json"),
            r#"{"id":"sample","name":"S","version":"1","kind":"integration","network":true}"#,
        )
        .unwrap();

        let installed = install_plugin_inner(src.path().to_str().unwrap()).unwrap();
        assert_eq!(installed.manifest.id, "sample");
        assert!(installed.manifest.network);

        let list = list_plugins_inner().unwrap();
        assert_eq!(list.len(), 1);

        uninstall_plugin_inner("sample").unwrap();
        let list = list_plugins_inner().unwrap();
        std::env::remove_var("LITEDUCK_HOME");
        assert!(list.is_empty());
    }
}
