//! Settings storage — Tauri command layer.
//!
//! # DEPRECATED
//!
//! Non-secret settings are being migrated to `config.json` (see `home.rs`).
//! New code should use [`crate::home::read_config`] / [`crate::home::write_config`]
//! instead of the SQLite-backed helpers in this module.
//!
//! This module is retained for:
//! - **OS keychain secret storage** — `get_setting` / `save_setting` / `delete_setting`
//!   with `is_secret = true` remain the canonical path for tokens and passwords.
//! - **Legacy migration support** — `home::migrate_settings_db` reads from the
//!   SQLite store once and writes values into `config.json`.
//! - **Shared SQLite database** — other modules share the same SQLite database;
//!   the connection returned by `db::get_conn()` is still used there.
//!
//! New non-secret reads should call [`get_setting_v2`], which prefers
//! `config.json` and falls back to SQLite only for keys not yet migrated.

use crate::{db, home, keychain};
use futures_util::future::join_all;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

// ── In-memory cache for secret settings ───────────────────────────────────────
//
// Avoids repeated OS keychain roundtrips (10-50 ms each) for hot paths such as
// a stored API token that is read on every API call.
//
// Cache entry semantics:
//   key absent                → not yet fetched; go to keychain
//   (Some(value), instant)    → cached secret value with insertion timestamp
//   (None, instant)           → known to be absent in the keychain (negative cache)
//
// Session-lifetime cache: secrets are fetched from the OS keychain once per app
// launch and never re-fetched until the app restarts.  This prevents repeated
// macOS Keychain password prompts during the session.  Writes via
// save_setting/delete_setting still invalidate immediately.
//
// Previous value was 1 hour (3600s), which caused the macOS Keychain password
// dialog to reappear mid-session whenever the cache expired.

const SECRET_CACHE_TTL: Duration = Duration::from_secs(86_400 * 365); // effectively forever

// The HashMap value `(Option<String>, Instant)` makes the full type exceed
// Clippy's complexity threshold.  The type is intentional and confined to this
// private helper, so we suppress the warning here.
#[allow(clippy::type_complexity)]
fn secret_cache() -> &'static Mutex<HashMap<String, (Option<String>, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Option<String>, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── Error helper ──────────────────────────────────────────────────────────────

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns all non-secret settings, merging config.json with SQLite fallback.
///
/// Config.json values take precedence.  SQLite entries for keys not yet in
/// config.json are included so legacy settings remain visible.
/// Secret values are not included; callers must use `get_setting` with
/// `is_secret = true` to retrieve individual secrets.
#[tauri::command]
pub fn get_settings() -> Result<HashMap<String, String>, String> {
    // Start with SQLite entries (legacy / unmapped keys).
    let conn = db::get_conn()?;
    let mut map = db::get_all_settings(&conn).map_err(db_err)?;

    // Overlay with config.json values (authoritative for mapped keys).
    if let Ok(cfg) = home::read_config() {
        for key in CONFIG_KEYS {
            if let Some(val) = config_key_to_value(key, &cfg) {
                map.insert(key.to_string(), val);
            }
        }
    }

    Ok(map)
}

/// All flat keys that `config_key_to_value` can resolve from config.json.
const CONFIG_KEYS: &[&str] = &[
    "theme",
    "font_family",
    "font_size",
    "sidebar_position",
    "sidebar_collapsed",
    "terminal_shell",
    "terminal_scrollback",
];

/// Persists a single setting.
///
/// When `is_secret` is `true` the value is stored in the OS keychain and
/// **not** written to SQLite.  All other values go to SQLite.
/// The in-memory cache is updated so the next `get_setting` call returns the
/// new value without a keychain roundtrip.
///
/// The keychain call is offloaded to a blocking thread via
/// `tokio::task::spawn_blocking` so the Tauri command handler thread is never
/// stalled by a slow OS keychain IPC.
#[tauri::command]
pub async fn save_setting(key: String, value: String, is_secret: bool) -> Result<(), String> {
    if is_secret {
        // Clone the key/value so they can be moved into the blocking closure.
        let key_clone = key.clone();
        let value_clone = value.clone();
        tokio::task::spawn_blocking(move || keychain::store_secret(&key_clone, &value_clone))
            .await
            .map_err(|e| format!("spawn_blocking error: {e}"))??;
        // Update cache with the newly stored value and current timestamp.
        let mut cache = secret_cache()
            .lock()
            .map_err(|e| format!("secret cache lock poisoned: {e}"))?;
        cache.insert(key, (Some(value), Instant::now()));
        Ok(())
    } else {
        save_setting_v2(&key, &value)
    }
}

/// Mutex that serialises read-modify-write cycles on `config.json` so
/// concurrent `save_setting` calls from `Promise.all` don't corrupt the file.
static CONFIG_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Persists a non-secret setting to `config.json`, falling back to SQLite
/// for keys that are not yet mapped in the typed Config struct.
fn save_setting_v2(key: &str, value: &str) -> Result<(), String> {
    let _guard = CONFIG_WRITE_LOCK
        .lock()
        .map_err(|e| format!("config write lock poisoned: {e}"))?;

    // Try to apply to the typed Config struct first.
    match home::read_config() {
        Ok(mut cfg) => {
            if home::apply_setting_key_pub(key, value, &mut cfg) {
                home::write_config(&cfg)?;
                return Ok(());
            }
            // Key not recognised by config — fall through to SQLite.
        }
        Err(_) => {
            // Config unreadable — fall through to SQLite.
        }
    }

    // SQLite fallback for keys not (yet) in config.json.
    let conn = db::get_conn()?;
    db::set_setting(&conn, key, value).map_err(db_err)
}

/// Reads a single setting.
///
/// When `is_secret` is `true` the value is retrieved from the OS keychain,
/// with an in-memory cache to avoid redundant keychain roundtrips.
/// Returns `None` when the key does not exist in the respective store.
///
/// The keychain call (slow path) is offloaded to a blocking thread via
/// `tokio::task::spawn_blocking` so the Tauri command handler thread is never
/// stalled by a slow OS keychain IPC.
/// Internal helper: read a secret from keychain with caching (no biometric gate).
async fn read_secret_cached(key: String) -> Result<Option<String>, String> {
    // Fast path: return cached value if present and not yet expired.
    {
        let cache = secret_cache()
            .lock()
            .map_err(|e| format!("secret cache lock poisoned: {e}"))?;
        if let Some((cached_value, inserted_at)) = cache.get(&key) {
            if inserted_at.elapsed() <= SECRET_CACHE_TTL {
                return Ok(cached_value.clone());
            }
        }
    }

    // Slow path: fetch from keychain on a blocking thread and populate cache.
    let key_clone = key.clone();
    let value = tokio::task::spawn_blocking(move || keychain::get_secret(&key_clone))
        .await
        .map_err(|e| format!("spawn_blocking error: {e}"))??;
    {
        let mut cache = secret_cache()
            .lock()
            .map_err(|e| format!("secret cache lock poisoned: {e}"))?;
        cache.insert(key, (value.clone(), Instant::now()));
    }
    Ok(value)
}

#[tauri::command]
pub async fn get_setting(
    bio_gate: tauri::State<'_, crate::biometric::BiometricGateState>,
    key: String,
    is_secret: bool,
) -> Result<Option<String>, String> {
    if is_secret && !bio_gate.can_access_secrets() {
        return Err("Biometric authentication required to access secrets".to_string());
    }
    if is_secret {
        read_secret_cached(key).await
    } else {
        get_setting_v2(&key)
    }
}

/// Fetches multiple secret settings in a single IPC call.
///
/// Returns a map of key → value for all requested keys that exist in the
/// keychain.  Keys that are not found are omitted from the result.
/// Each key is checked against the in-memory cache before hitting the keychain.
///
/// All cache-miss keys are fetched **concurrently** — one
/// `tokio::task::spawn_blocking` task per key — so a batch of N secrets costs
/// roughly the same wall-clock time as a single keychain lookup.
#[tauri::command]
pub async fn get_secrets(
    bio_gate: tauri::State<'_, crate::biometric::BiometricGateState>,
    keys: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    if !bio_gate.can_access_secrets() {
        return Err("Biometric authentication required to access secrets".to_string());
    }
    // Fan out: create one future per key.
    let futures: Vec<_> = keys
        .into_iter()
        .map(|key| async move {
            let value = read_secret_cached(key.clone()).await?;
            Ok::<(String, Option<String>), String>((key, value))
        })
        .collect();

    // Await all futures concurrently.
    let results = join_all(futures).await;

    // Collect into a map, short-circuiting on any error.
    let mut result = HashMap::new();
    for item in results {
        let (key, value) = item?;
        if let Some(v) = value {
            result.insert(key, v);
        }
    }
    Ok(result)
}

/// All secret keys the app may store in the OS keychain.
///
/// Shared between `preload_secrets` (cache-warm at launch) and
/// `reset_all_settings` (wipe on factory reset).  Add new secret keys here
/// to avoid mid-session keychain prompts.
const ALL_SECRET_KEYS: &[&str] = &[];

/// Preload all known secret keys into the in-memory cache.
///
/// Called once at app startup so the OS keychain password prompt only appears
/// at launch, not repeatedly during the session.  Keys that don't exist in the
/// keychain are cached as absent (negative cache) to avoid future prompts.
#[tauri::command]
pub async fn preload_secrets() -> Result<(), String> {
    for &key in ALL_SECRET_KEYS {
        let _ = read_secret_cached(key.to_string()).await;
    }

    log::info!(
        "[settings] preloaded {} secret keys into cache",
        ALL_SECRET_KEYS.len()
    );
    Ok(())
}

/// Resets all app settings and secrets to factory defaults.
///
/// Steps (each performed best-effort; partial failures are collected and
/// returned as a single error summary rather than aborting early):
///
/// 1. Delete all known keychain secrets (service: `com.bemindlabs.liteduck`).
/// 2. Write `Config::default()` to `~/.LiteDuck/config.json` and invalidate
///    the config cache.
/// 3. Clear all rows from the SQLite `settings` table.
/// 4. Wipe the in-memory secret cache so the next read goes straight to the
///    (now-empty) keychain.
///
/// The command is offloaded to a blocking thread for the keychain operations
/// and runs synchronously for the in-memory and SQLite steps.
#[tauri::command]
pub async fn reset_all_settings(
    bio_gate: tauri::State<'_, crate::biometric::BiometricGateState>,
) -> Result<(), String> {
    reset_all_settings_inner(&bio_gate).await
}

/// Inner implementation that takes a borrowed gate so it is unit-testable
/// without spinning up the Tauri runtime. The Tauri command above is a
/// one-line forwarder.
async fn reset_all_settings_inner(
    bio_gate: &crate::biometric::BiometricGateState,
) -> Result<(), String> {
    // Match the auth requirement of `get_setting`/`get_secrets`. A factory
    // reset deletes every keychain secret, so it must clear the biometric
    // gate just like reading them does — otherwise an unattended app or a
    // compromised frontend could trigger a destructive reset while locked.
    if !bio_gate.can_access_secrets() {
        return Err("Biometric authentication required to reset settings".to_string());
    }

    let mut errors: Vec<String> = Vec::new();

    // ── Step 1: Delete keychain secrets ──────────────────────────────────────
    // Each key is deleted individually on a blocking thread.  A missing key is
    // not an error (keychain::delete_secret already silently succeeds for
    // NoEntry), but any other keychain error is collected.
    for &key in ALL_SECRET_KEYS {
        let key_owned = key.to_string();
        match tokio::task::spawn_blocking(move || keychain::delete_secret(&key_owned))
            .await
            .map_err(|e| format!("spawn_blocking error for '{key}': {e}"))
        {
            Ok(Ok(())) => {}
            Ok(Err(e)) => errors.push(format!("keychain delete '{key}': {e}")),
            Err(e) => errors.push(e),
        }
    }

    // ── Step 2: Reset config.json to defaults ─────────────────────────────────
    // write_config also calls invalidate_config_cache internally, so both the
    // file and the cache are handled in one call.
    if let Err(e) = home::write_config(&home::Config::default()) {
        errors.push(format!("config.json reset: {e}"));
    }

    // ── Step 3: Clear SQLite settings table ──────────────────────────────────
    match db::get_conn() {
        Ok(conn) => {
            if let Err(e) = conn.execute("DELETE FROM settings", []) {
                errors.push(format!("settings table clear: {e}"));
            }
        }
        Err(e) => errors.push(format!("db connection: {e}")),
    }

    // ── Step 4: Wipe in-memory secret cache ──────────────────────────────────
    // Clear all entries so no stale cached value can survive the reset.
    match secret_cache().lock() {
        Ok(mut cache) => cache.clear(),
        Err(e) => errors.push(format!("secret cache clear: {e}")),
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "reset completed with {} error(s): {}",
            errors.len(),
            errors.join("; ")
        ))
    }
}

/// Deletes a single setting from the appropriate store.
/// For secret keys the in-memory cache entry is set to `None` (negative cache)
/// so subsequent reads do not round-trip to the keychain for a missing key.
///
/// The keychain call is offloaded to a blocking thread via
/// `tokio::task::spawn_blocking` so the Tauri command handler thread is never
/// stalled by a slow OS keychain IPC.
#[tauri::command]
pub async fn delete_setting(key: String, is_secret: bool) -> Result<(), String> {
    if is_secret {
        let key_clone = key.clone();
        tokio::task::spawn_blocking(move || keychain::delete_secret(&key_clone))
            .await
            .map_err(|e| format!("spawn_blocking error: {e}"))??;
        // Record absence in cache to avoid unnecessary keychain misses.
        // The TTL still applies so that a key re-created externally is visible
        // after at most SECRET_CACHE_TTL seconds.
        let mut cache = secret_cache()
            .lock()
            .map_err(|e| format!("secret cache lock poisoned: {e}"))?;
        cache.insert(key, (None, Instant::now()));
        Ok(())
    } else {
        let conn = db::get_conn()?;
        db::delete_setting(&conn, &key).map_err(db_err)
    }
}

// ── V2 reader: config.json first, SQLite fallback ─────────────────────────────

/// Reads a non-secret setting, preferring `config.json` over SQLite.
///
/// The key is mapped to the typed [`home::Config`] struct using the same
/// flat-key vocabulary that [`home::migrate_settings_db`] understands (e.g.
/// `"theme"` → `config.appearance.theme`).  If the key is recognised the value
/// is returned as a `String` directly from the in-memory config cache, incurring
/// no disk I/O on the hot path.
///
/// For keys that are not (yet) represented in `config.json` the function falls
/// back to querying SQLite via `db::get_conn()`, keeping behaviour identical to
/// the existing [`get_setting`] Tauri command.
///
/// # Errors
/// Returns `Err(String)` only when both the config-json lookup and the SQLite
/// fallback fail with an I/O or lock error.
pub fn get_setting_v2(key: &str) -> Result<Option<String>, String> {
    // Attempt to resolve from the in-memory config cache first.
    match home::read_config() {
        Ok(cfg) => {
            if let Some(val) = config_key_to_value(key, &cfg) {
                return Ok(Some(val));
            }
            // Key not found in config.json — fall through to SQLite.
        }
        Err(_) => {
            // Config unreadable (e.g. corrupt JSON) — fall through to SQLite.
        }
    }

    // SQLite fallback for keys not (yet) in config.json.
    let conn = db::get_conn()?;
    db::get_setting(&conn, key).map_err(|e| e.to_string())
}

/// Maps a flat settings key to its current value from a typed [`home::Config`].
///
/// Returns `Some(value_as_string)` when the key is recognised, `None` when it
/// is unknown (so the caller can fall back to SQLite).  This is the inverse of
/// [`home::apply_setting_key`] — same key vocabulary, opposite direction.
fn config_key_to_value(key: &str, cfg: &home::Config) -> Option<String> {
    match key {
        // ── Appearance ────────────────────────────────────────────────────────
        "theme" => Some(cfg.appearance.theme.clone()),
        "font_family" => Some(cfg.appearance.font_family.clone()),
        "font_size" => Some(cfg.appearance.font_size.to_string()),
        "sidebar_position" => Some(cfg.appearance.sidebar_position.clone()),
        "sidebar_collapsed" => Some(cfg.appearance.sidebar_collapsed.to_string()),
        // ── Terminal ──────────────────────────────────────────────────────────
        "terminal_shell" | "shell" => Some(cfg.terminal.shell.clone()),
        "terminal_scrollback" | "scrollback" => Some(cfg.terminal.scrollback.to_string()),
        // ── Git ───────────────────────────────────────────────────────────────
        "git_auto_fetch" | "auto_fetch" => Some(cfg.git.auto_fetch.to_string()),
        "git_sign_commits" | "sign_commits" => Some(cfg.git.sign_commits.to_string()),
        "git_fetch_interval" | "fetch_interval_secs" => {
            Some(cfg.git.fetch_interval_secs.to_string())
        }
        // ── Telemetry ─────────────────────────────────────────────────────────
        "telemetry_enabled" => Some(cfg.telemetry.enabled.to_string()),
        // Unknown / not-yet-migrated key — caller should try SQLite.
        _ => None,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Cache helpers ──────────────────────────────────────────────────────────

    /// Directly populate the secret cache for a key with a given value and a
    /// synthetic insertion timestamp.  This lets tests control "age" without
    /// sleeping.
    fn cache_insert(key: &str, value: Option<String>, inserted_at: Instant) {
        let mut cache = secret_cache().lock().unwrap();
        cache.insert(key.to_string(), (value, inserted_at));
    }

    /// Read the raw cache entry (value, inserted_at) for a key, if present.
    fn cache_get(key: &str) -> Option<(Option<String>, Instant)> {
        let cache = secret_cache().lock().unwrap();
        cache.get(key).cloned()
    }

    /// Remove an entry from the cache so tests don't pollute each other.
    fn cache_remove(key: &str) {
        let mut cache = secret_cache().lock().unwrap();
        cache.remove(key);
    }

    // ── store and retrieve a fresh cache entry ─────────────────────────────────

    /// A value written directly into the cache is returned by the cache lookup
    /// as long as the entry has not expired.
    #[test]
    fn cache_stores_and_retrieves_fresh_value() {
        let key = "__test_cache_fresh__";
        let value = "my-secret-value".to_string();

        cache_insert(key, Some(value.clone()), Instant::now());

        let entry = cache_get(key).expect("entry should be present");
        assert_eq!(
            entry.0,
            Some(value),
            "cached value should match what was stored"
        );
        // Entry must not be considered stale yet.
        assert!(
            entry.1.elapsed() <= SECRET_CACHE_TTL,
            "freshly inserted entry should be within TTL"
        );

        cache_remove(key);
    }

    // ── negative cache: None stored means "known absent" ──────────────────────

    /// Inserting `None` into the cache records a negative entry (key known to
    /// be absent in the keychain) and is distinguishable from a missing entry.
    #[test]
    fn cache_stores_negative_entry() {
        let key = "__test_cache_negative__";

        cache_insert(key, None, Instant::now());

        let entry = cache_get(key).expect("negative entry should be present");
        assert!(
            entry.0.is_none(),
            "negative cache entry value should be None"
        );

        cache_remove(key);
    }

    // ── expired entry is stale ─────────────────────────────────────────────────

    /// An entry whose `inserted_at` is older than SECRET_CACHE_TTL is stale.
    /// `get_setting` must not return it and must re-fetch from the keychain.
    /// We verify staleness detection by back-dating the insertion time.
    #[test]
    fn cache_entry_is_stale_after_ttl() {
        let key = "__test_cache_stale__";
        // Back-date the insertion time by TTL + 1 second.
        let stale_at = Instant::now()
            .checked_sub(SECRET_CACHE_TTL + Duration::from_secs(1))
            .expect("system clock must support subtraction here");

        cache_insert(key, Some("old-secret".to_string()), stale_at);

        let entry = cache_get(key).expect("stale entry should still be in the map");
        assert!(
            entry.1.elapsed() > SECRET_CACHE_TTL,
            "entry elapsed time should exceed TTL, confirming it is stale"
        );

        cache_remove(key);
    }

    // ── save_setting invalidates (updates) the cache ───────────────────────────

    /// After `save_setting` with `is_secret = true`, the cache should hold
    /// the new value with a fresh timestamp, so the next `get_setting` call
    /// returns the new value without a keychain roundtrip.
    ///
    /// This test calls the real OS keychain; it is skipped if the keychain is
    /// unavailable (e.g. in headless CI).
    #[tokio::test]
    async fn save_setting_updates_cache_entry() -> Result<(), String> {
        let key = "__test_save_updates_cache__".to_string();
        let value = "fresh-value".to_string();

        // Pre-populate with a stale value so we can confirm it is replaced.
        let stale_at = Instant::now()
            .checked_sub(SECRET_CACHE_TTL + Duration::from_secs(1))
            .unwrap();
        cache_insert(&key, Some("stale-value".to_string()), stale_at);

        // save_setting calls keychain::store_secret; skip gracefully if OS
        // keychain is unavailable (returns Err).
        match save_setting(key.clone(), value.clone(), true).await {
            Err(e)
                if e.contains("keychain")
                    || e.contains("Keychain")
                    || e.contains("SecItem")
                    || e.contains("DBus")
                    || e.contains("Platform secure storage") =>
            {
                cache_remove(&key);
                return Ok(()); // Keychain not available in this environment — skip.
            }
            Err(e) => {
                cache_remove(&key);
                return Err(format!("save_setting failed unexpectedly: {e}"));
            }
            Ok(()) => {}
        }

        let entry = cache_get(&key).expect("cache should have an entry after save_setting");
        assert_eq!(
            entry.0,
            Some(value),
            "cache should hold the newly saved value"
        );
        assert!(
            entry.1.elapsed() <= SECRET_CACHE_TTL,
            "cache entry should be fresh after save"
        );

        // Clean up keychain and cache.
        let _ = keychain::delete_secret(&key);
        cache_remove(&key);
        Ok(())
    }

    // ── delete_setting invalidates cache with a negative entry ─────────────────

    /// After `delete_setting` with `is_secret = true`, the cache should hold
    /// `None` (negative entry) so subsequent reads skip the keychain.
    #[tokio::test]
    async fn delete_setting_writes_negative_cache_entry() -> Result<(), String> {
        let key = "__test_delete_neg_cache__".to_string();

        // Seed a positive cache entry.
        cache_insert(&key, Some("some-secret".to_string()), Instant::now());

        // delete_setting calls keychain::delete_secret.  Tolerate keychain
        // unavailability gracefully.
        match delete_setting(key.clone(), true).await {
            Err(e)
                if e.contains("keychain")
                    || e.contains("Keychain")
                    || e.contains("SecItem")
                    || e.contains("DBus")
                    || e.contains("Platform secure storage") =>
            {
                cache_remove(&key);
                return Ok(()); // Keychain not available in this environment — skip.
            }
            Err(e) => {
                cache_remove(&key);
                return Err(format!("delete_setting failed unexpectedly: {e}"));
            }
            Ok(()) => {}
        }

        let entry = cache_get(&key).expect("cache should have a negative entry after delete");
        assert!(
            entry.0.is_none(),
            "cache entry value should be None (negative) after delete_setting"
        );
        assert!(
            entry.1.elapsed() <= SECRET_CACHE_TTL,
            "negative cache entry should be fresh"
        );

        cache_remove(&key);
        Ok(())
    }

    // ── SECRET_CACHE_TTL constant ──────────────────────────────────────────────

    /// The TTL constant is effectively forever (1 year) — secrets are cached
    /// for the lifetime of the app session. Cache is in-memory and resets on
    /// restart, so rotated credentials take effect after an app relaunch.
    #[test]
    fn secret_cache_ttl_is_session_lifetime() {
        assert_eq!(
            SECRET_CACHE_TTL,
            Duration::from_secs(86_400 * 365),
            "SECRET_CACHE_TTL must be 1 year (session-lifetime cache)"
        );
    }

    // ── reset_all_settings: biometric gate ─────────────────────────────────────

    use crate::biometric::BiometricGateState;
    use std::sync::atomic::AtomicBool;

    /// When biometric is enabled and the session is locked, `reset_all_settings`
    /// must refuse and return the auth-required error WITHOUT touching the
    /// secret cache. Mirrors the same guard that protects `get_setting`.
    #[tokio::test]
    async fn reset_all_settings_blocked_when_gate_locked() {
        // Sentinel value in cache to prove the locked path doesn't wipe state.
        let key = "__test_reset_blocked_sentinel__";
        cache_insert(key, Some("preserved".to_string()), Instant::now());

        let locked = BiometricGateState {
            enabled: AtomicBool::new(true),
            unlocked: AtomicBool::new(false),
        };

        let result = reset_all_settings_inner(&locked).await;

        assert!(
            matches!(&result, Err(msg) if msg.contains("Biometric authentication required")),
            "locked gate should reject reset, got: {result:?}"
        );

        // Cache must be untouched on the rejected path.
        let entry = cache_get(key);
        assert!(
            matches!(&entry, Some((Some(v), _)) if v == "preserved"),
            "secret cache must survive a rejected reset, got: {entry:?}"
        );

        cache_remove(key);
    }

    /// When the biometric gate is unlocked (or biometric is disabled),
    /// `reset_all_settings` must clear the in-memory secret cache.
    /// We don't assert on keychain or DB state here — those depend on the host
    /// environment and are best-effort during reset; existing tests already
    /// gracefully skip when the keychain is unavailable.
    #[tokio::test]
    async fn reset_all_settings_clears_secret_cache_when_unlocked() {
        let key1 = "__test_reset_unlocked_a__";
        let key2 = "__test_reset_unlocked_b__";
        cache_insert(key1, Some("v1".to_string()), Instant::now());
        cache_insert(key2, None, Instant::now());

        let unlocked = BiometricGateState::default(); // enabled=false, unlocked=true

        // Result may be Ok or Err (partial keychain failure on hosts without
        // a usable keychain). Either way, the cache wipe step runs last and
        // must always execute.
        let _ = reset_all_settings_inner(&unlocked).await;

        assert!(
            cache_get(key1).is_none(),
            "positive cache entry should be wiped after reset"
        );
        assert!(
            cache_get(key2).is_none(),
            "negative cache entry should be wiped after reset"
        );
    }

    /// Two consecutive resets must be safe — calling once already empties the
    /// cache and (best-effort) the keychain, so a second call is a no-op.
    #[tokio::test]
    async fn reset_all_settings_is_idempotent() {
        let unlocked = BiometricGateState::default();
        let _ = reset_all_settings_inner(&unlocked).await;
        let result = reset_all_settings_inner(&unlocked).await;

        // Second call must not panic; result depends on the host keychain but
        // the function must return cleanly.
        let _ = result; // explicit: we only care that it didn't panic
    }
}
