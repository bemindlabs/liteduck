//! Tauri-layer device identity module.
//!
//! All business logic lives in `liteduck_core::device_identity`.  This module
//! provides:
//! - Re-export of `DeviceIdentity` so the rest of the Tauri crate is unaffected.
//! - `#[tauri::command]` handlers that resolve the platform data directory via
//!   `AppHandle` and delegate to the core functions.

// ── Re-exports ────────────────────────────────────────────────────────────────

pub use liteduck_core::device_identity::DeviceIdentity;

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns the current device identity, creating and persisting one if it does
/// not yet exist.
#[tauri::command]
pub fn device_get_identity(app: tauri::AppHandle) -> Result<DeviceIdentity, String> {
    let data_dir = resolve_data_dir(&app)?;
    liteduck_core::device_identity::load_or_create_identity(&data_dir)
}

/// Regenerates the device identity and persists it, replacing the previous one.
#[tauri::command]
pub fn device_reset_identity(app: tauri::AppHandle) -> Result<DeviceIdentity, String> {
    let data_dir = resolve_data_dir(&app)?;
    liteduck_core::device_identity::reset_identity(&data_dir)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn resolve_data_dir(app: &tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    dir.to_str()
        .ok_or_else(|| "app data dir path is not valid UTF-8".to_string())
        .map(|s| s.to_string())
}
