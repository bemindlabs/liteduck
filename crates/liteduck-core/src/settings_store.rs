//! Settings CRUD operations for the key/value `settings` table.
//!
//! All functions accept a `&Connection` so the caller controls where the
//! database lives.  The `settings` table is created by `db::open()` as part of
//! the shared schema — callers must open the database through that function
//! before using anything in this module.
//!
//! # Example
//!
//! ```rust,no_run
//! use liteduck_core::{db, settings_store};
//!
//! let conn = db::open_in_memory().unwrap();
//! settings_store::set_setting(&conn, "theme", "dark").unwrap();
//! let theme = settings_store::get_setting(&conn, "theme").unwrap();
//! assert_eq!(theme, Some("dark".to_string()));
//! ```

use rusqlite::{params, Connection, Result};
use std::collections::HashMap;

/// Retrieves the value for `key`, returning `None` when not found.
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

/// Inserts or replaces the value for `key`.
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
             value      = excluded.value,
             updated_at = excluded.updated_at",
        params![key, value, now],
    )?;
    Ok(())
}

/// Returns all settings as a key/value map.
pub fn get_all_settings(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

/// Removes the setting with the given `key`. Silently succeeds if not found.
pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn mem() -> Connection {
        db::open_in_memory().expect("in-memory DB")
    }

    #[test]
    fn get_setting_returns_none_for_missing_key() {
        let conn = mem();
        assert!(get_setting(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn set_and_get_setting_round_trip() {
        let conn = mem();
        set_setting(&conn, "theme", "dark").unwrap();
        assert_eq!(get_setting(&conn, "theme").unwrap(), Some("dark".into()));
    }

    #[test]
    fn set_setting_overwrites_existing_value() {
        let conn = mem();
        set_setting(&conn, "lang", "en").unwrap();
        set_setting(&conn, "lang", "th").unwrap();
        assert_eq!(get_setting(&conn, "lang").unwrap(), Some("th".into()));
    }

    #[test]
    fn delete_setting_removes_key() {
        let conn = mem();
        set_setting(&conn, "tmp", "val").unwrap();
        delete_setting(&conn, "tmp").unwrap();
        assert!(get_setting(&conn, "tmp").unwrap().is_none());
    }

    #[test]
    fn delete_setting_is_noop_for_missing_key() {
        let conn = mem();
        assert!(delete_setting(&conn, "nope").is_ok());
    }

    #[test]
    fn get_all_settings_returns_all_keys() {
        let conn = mem();
        set_setting(&conn, "a", "1").unwrap();
        set_setting(&conn, "b", "2").unwrap();
        let all = get_all_settings(&conn).unwrap();
        assert_eq!(all.get("a").map(|s| s.as_str()), Some("1"));
        assert_eq!(all.get("b").map(|s| s.as_str()), Some("2"));
    }
}
