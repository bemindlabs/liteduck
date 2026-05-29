//! Multi-window support.
//!
//! Each top-level window has a unique Tauri label (`main` for the first,
//! `window-<8-hex>` for the rest). A label tags PTY sessions, routes menu
//! events to the focused window, and selects a `TauriEventSink` so backend
//! emits land on the right webview.
//!
//! The window registry persists at `~/.liteduck/windows.json`. Phase 1 stores
//! the workspace path per label; geometry persistence is Phase 2.
//!
//! The frontend reads `?workspace=<path>&window=<label>` from the location
//! query string on mount so each window can target a different workspace
//! without a global mutable setting.
//!
//! Desktop-only — iOS has a single webview and no concept of secondary
//! windows.

use std::collections::HashSet;
use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::home::home_dir;

const WINDOWS_REGISTRY_FILE: &str = "windows.json";
const REGISTRY_SCHEMA_VERSION: u32 = 1;

/// Serialises the read-modify-write cycle over `windows.json`. Two windows
/// persisting their workspace concurrently (or one closing while another sets
/// a workspace) would otherwise read the same base, mutate, and write back —
/// silently dropping one window's entry.
static REGISTRY_LOCK: Mutex<()> = Mutex::new(());

// ── Registry types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowsFile {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    windows: Vec<WindowState>,
}

fn default_version() -> u32 {
    REGISTRY_SCHEMA_VERSION
}

impl Default for WindowsFile {
    fn default() -> Self {
        Self {
            version: REGISTRY_SCHEMA_VERSION,
            windows: Vec::new(),
        }
    }
}

fn registry_path() -> PathBuf {
    home_dir().join(WINDOWS_REGISTRY_FILE)
}

fn read_registry() -> WindowsFile {
    let path = registry_path();
    if !path.exists() {
        return WindowsFile::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => WindowsFile::default(),
    }
}

fn write_registry(file: &WindowsFile) -> Result<(), String> {
    let path = registry_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create home dir for windows.json: {e}"))?;
    }
    let text = serde_json::to_string_pretty(file)
        .map_err(|e| format!("Failed to serialise windows.json: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("Failed to write windows.json: {e}"))
}

fn upsert_window(label: &str, workspace: Option<String>) {
    let _guard = REGISTRY_LOCK.lock();
    let mut file = read_registry();
    file.version = REGISTRY_SCHEMA_VERSION;
    if let Some(existing) = file.windows.iter_mut().find(|w| w.label == label) {
        existing.workspace = workspace;
    } else {
        file.windows.push(WindowState {
            label: label.to_string(),
            workspace,
        });
    }
    if let Err(e) = write_registry(&file) {
        log::warn!("windows.json upsert failed: {e}");
    }
}

fn remove_window(label: &str) {
    let _guard = REGISTRY_LOCK.lock();
    let mut file = read_registry();
    file.windows.retain(|w| w.label != label);
    if let Err(e) = write_registry(&file) {
        log::warn!("windows.json remove failed: {e}");
    }
}

// ── Label / URL helpers ─────────────────────────────────────────────────────

fn next_window_label() -> String {
    let id = uuid::Uuid::new_v4().simple().to_string();
    format!("window-{}", &id[..8])
}

/// Generate a window label guaranteed not to collide with an already-open
/// window. Tauri requires unique webview labels — a collision makes
/// `WebviewWindowBuilder::build()` fail — so we retry until the candidate is
/// free. 8 hex chars make a collision astronomically rare, but a one-off
/// retry costs nothing and removes the failure mode entirely.
fn unique_window_label(existing: &HashSet<String>) -> String {
    loop {
        let candidate = next_window_label();
        if !existing.contains(&candidate) {
            return candidate;
        }
    }
}

/// Build `index.html?workspace=<encoded>&window=<label>` as the entry URL.
///
/// The frontend reads these query params on mount in `WorkspaceContext` and
/// `lib/window.ts` to scope its state to this window.
fn build_entry_url(label: &str, workspace: Option<&str>) -> WebviewUrl {
    let mut query = format!("window={}", urlencoding_encode(label));
    if let Some(ws) = workspace {
        if !ws.is_empty() {
            query.push_str("&workspace=");
            query.push_str(&urlencoding_encode(ws));
        }
    }
    WebviewUrl::App(PathBuf::from(format!("index.html?{query}")))
}

/// Minimal URL component encoder so we don't pull in the full `url` crate API
/// here (it's already a dependency, but `form_urlencoded` is the relevant
/// surface and it's simpler to inline for two params).
fn urlencoding_encode(s: &str) -> String {
    form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

// ── IPC commands ────────────────────────────────────────────────────────────

/// Open a new top-level window.
///
/// If `workspace` is `Some`, the new window loads with that workspace
/// pre-selected. If `None`, the window lands at the route the frontend
/// chooses for "no workspace" (typically `/landing`).
///
/// Returns the new window's Tauri label so the caller can target it later
/// (e.g. focus, close, set workspace).
#[tauri::command]
pub fn window_open(app: AppHandle, workspace: Option<String>) -> Result<String, String> {
    let existing: HashSet<String> = app.webview_windows().into_keys().collect();
    let label = unique_window_label(&existing);
    let url = build_entry_url(&label, workspace.as_deref());

    let window = WebviewWindowBuilder::new(&app, &label, url)
        .title("LiteDuck — Code Editor")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .build()
        .map_err(|e| format!("Failed to open new window: {e}"))?;

    // Persist before we wire any listeners so a crash mid-setup still leaves
    // a recoverable record.
    upsert_window(&label, workspace);

    // Clean up the per-window state when the window is destroyed.
    let label_for_cleanup = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            remove_window(&label_for_cleanup);
        }
    });

    Ok(label)
}

/// Return the list of recorded windows from `~/.liteduck/windows.json`.
#[tauri::command]
pub fn window_list() -> Vec<WindowState> {
    let _guard = REGISTRY_LOCK.lock();
    read_registry().windows
}

/// Persist the workspace path for a given window label.
///
/// Frontend calls this whenever `WorkspaceContext.setWorkspace(...)` is
/// invoked so the next launch can restore the right workspace per window
/// (Phase 2 will additionally restore geometry).
#[tauri::command]
pub fn window_set_workspace(label: String, workspace: String) -> Result<(), String> {
    let ws = if workspace.is_empty() {
        None
    } else {
        Some(workspace)
    };
    upsert_window(&label, ws);
    Ok(())
}

/// Return the label of the current window (the one that invoked the call).
///
/// Frontend uses this to learn its own label on mount when the URL doesn't
/// carry one (e.g. the bundled `main` window before any query string is
/// applied). Cheap, sync — just reads from the WebviewWindow.
#[tauri::command]
pub fn window_current_label(window: WebviewWindow) -> String {
    window.label().to_string()
}

// ── form_urlencoded — vendored two-line shim ────────────────────────────────
//
// We don't want to add a new dep just for byte_serialize. The `url` crate
// (already in Cargo.toml) re-exports `form_urlencoded`, so we proxy through it
// here.

mod form_urlencoded {
    pub use url::form_urlencoded::byte_serialize;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_is_unique_and_well_formed() {
        let a = next_window_label();
        let b = next_window_label();
        assert_ne!(a, b);
        assert!(a.starts_with("window-"));
        assert_eq!(a.len(), "window-".len() + 8);
    }

    #[test]
    fn entry_url_encodes_workspace() {
        let url = build_entry_url("window-abcd1234", Some("/Users/foo/My Project"));
        match url {
            WebviewUrl::App(p) => {
                let s = p.to_string_lossy().to_string();
                assert!(s.starts_with("index.html?"));
                assert!(s.contains("window=window-abcd1234"));
                // `/` and the space are percent-encoded (form_urlencoded uses
                // `+` for spaces, which decodes to a space the same way as
                // `%20` on the frontend's URLSearchParams).
                assert!(s.contains("workspace=%2FUsers%2Ffoo%2FMy"));
                assert!(s.contains("workspace=") && s.contains("Project"));
            }
            _ => panic!("expected WebviewUrl::App"),
        }
    }

    #[test]
    fn entry_url_omits_workspace_when_none() {
        let url = build_entry_url("window-x", None);
        match url {
            WebviewUrl::App(p) => {
                let s = p.to_string_lossy().to_string();
                assert!(!s.contains("workspace="));
            }
            _ => panic!("expected WebviewUrl::App"),
        }
    }
}
