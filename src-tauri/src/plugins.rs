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

/// Copy a plugin folder at `source` into `~/.liteduck/plugins/<id>/`.
///
/// The source must contain a valid `plugin.json`. The destination id is taken
/// from the (validated) manifest, never from the source folder name. Returns
/// the freshly-installed plugin.
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

    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to replace existing plugin '{}': {e}", manifest.id))?;
    }
    copy_dir_recursive(&src, &dest)?;

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

/// Run a plugin's contributed command. The command's `run` template is spawned
/// via `sh -c` with the plugin directory as CWD. Caller-supplied `params` are
/// exported as `LITEDUCK_PARAM_<KEY>` env vars (uppercased) — never interpolated
/// into the shell string, to keep user input off the command line.
pub fn run_command_inner(
    plugin_id: &str,
    command_id: &str,
    params: &HashMap<String, String>,
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
        .ok_or_else(|| {
            format!("plugin '{plugin_id}' has no command '{command_id}'")
        })?;

    let mut command = Command::new("sh");
    command.arg("-c").arg(&cmd.run);
    command.current_dir(&plugin.dir);
    command.env("LITEDUCK_PLUGIN_DIR", &plugin.dir);

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
            fs::copy(&from, &to)
                .map_err(|e| format!("Failed to copy {}: {e}", from.display()))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if to.extension().and_then(|e| e.to_str()) == Some("sh") {
                    let _ = fs::set_permissions(&to, fs::Permissions::from_mode(0o755));
                }
            }
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

/// Run a plugin's contributed command with optional params.
#[tauri::command]
pub fn plugin_run_command(
    plugin_id: String,
    command_id: String,
    params: Option<HashMap<String, String>>,
) -> Result<PluginRunResult, String> {
    run_command_inner(&plugin_id, &command_id, &params.unwrap_or_default())
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
    fn allowed_kind_loads() {
        let m: PluginManifest = serde_json::from_str(
            r#"{"id":"x","name":"X","version":"1","kind":"integration"}"#,
        )
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
            assert!(err.contains("deny-list"), "kind {kind} should be denied: {err}");
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
        let m: PluginManifest = serde_json::from_str(
            r#"{"id":"../evil","name":"X","version":"1","kind":"tool"}"#,
        )
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

        write_manifest(&root, "good", r#"{"id":"good","name":"G","version":"1","kind":"tool"}"#);
        write_manifest(&root, "bad", r#"{"id":"bad","name":"B","version":"1","kind":"agent"}"#);

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
        let res = run_command_inner("echoer", "hi", &params).unwrap();
        std::env::remove_var("LITEDUCK_HOME");

        assert_eq!(res.exit_code, 0);
        assert_eq!(res.stdout, "duck");
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
