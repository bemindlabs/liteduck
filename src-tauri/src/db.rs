//! Tauri-layer database module.
//!
//! All business logic lives in `liteduck_core::db`.  This module provides:
//! - `db_path()` — resolves the on-disk path using `dirs::data_local_dir()`
//! - `open()`    — calls `db_path()` then delegates to `liteduck_core::db::open()`
//! - `get_conn()` — shared connection opened lazily via `OnceLock<Mutex<Connection>>`
//! - Re-exports of all public types so the rest of the Tauri crate can continue
//!   to use `crate::db::ChatSession` etc. without change.
//!
//! # Lazy initialisation
//!
//! `get_conn()` uses `OnceLock::get_or_init`, so **the database file is never
//! opened until the first caller actually needs it**.  No explicit `open()` call
//! at application startup is required — and `lib.rs` no longer makes one.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};

// ── Re-exports ────────────────────────────────────────────────────────────────

pub use liteduck_core::db::{
    chat_clear, chat_insert, chat_list, delete_setting, get_all_settings, get_setting,
    session_create, session_delete, session_list, session_rename, session_touch, set_setting,
    ChatMessage, ChatSession,
};
pub use rusqlite::{Connection, Result};

// ── Path resolution ───────────────────────────────────────────────────────────

/// Returns the path to the SQLite database file.
/// Uses the user's app-local data directory (~/.local/share on Linux,
/// ~/Library/Application Support on macOS, %APPDATA% on Windows).
pub fn db_path() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("com.bemindlabs.liteduck").join("settings.db")
}

// ── Open ──────────────────────────────────────────────────────────────────────

/// Opens (or creates) the database and ensures the settings table exists.
/// Delegates to `liteduck_core::db::open()` after resolving the path.
///
/// Prefer `get_conn()` for all Tauri commands — this function exists for
/// one-shot migration/init calls and tests.
pub fn open() -> Result<Connection> {
    liteduck_core::db::open(&db_path())
}

// ── Shared connection ─────────────────────────────────────────────────────────

static DB_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

/// Returns a guard to the shared, process-wide SQLite connection.
///
/// The connection is opened exactly once (on first call) and reused for every
/// subsequent call, eliminating the per-command overhead of `open()`.  The
/// returned `MutexGuard` automatically releases the lock when dropped, so
/// callers must not hold it across `.await` points.
///
/// # Errors
/// Returns `Err(String)` if the initial `open()` fails or if the mutex is
/// poisoned (which only happens after a panic while holding the lock).
pub fn get_conn() -> std::result::Result<MutexGuard<'static, Connection>, String> {
    // Fast path: the connection has already been opened.
    if let Some(mutex) = DB_CONN.get() {
        return mutex.lock().map_err(|e| format!("DB lock error: {e}"));
    }

    // Slow path: open the database, propagating any IO/SQLite error as
    // `Err(String)` instead of panicking inside the `OnceLock` initialiser.
    // Under a rare first-call race two callers may each open a connection;
    // `get_or_init` keeps the first and drops (closes) the extra one.
    let conn = open().map_err(|e| format!("Failed to open shared database connection: {e}"))?;
    let mutex = DB_CONN.get_or_init(|| Mutex::new(conn));
    mutex.lock().map_err(|e| format!("DB lock error: {e}"))
}
