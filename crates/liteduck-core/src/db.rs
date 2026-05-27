//! SQLite database operations — settings, chat sessions, and chat messages.
//!
//! All functions accept a `&Connection` so the caller controls where the
//! database lives.  The Tauri layer resolves the path via `AppHandle`; mobile
//! layers pass their own platform-specific data directory.

use crate::scrum;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    workspace  TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default',
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO chat_sessions (id, title) VALUES ('default', 'Chat');
";

// ── Open ─────────────────────────────────────────────────────────────────────

/// Applies any additive schema migrations that may be needed on older databases.
///
/// Each `ALTER TABLE … ADD COLUMN` call is intentionally fire-and-forget:
/// SQLite returns "duplicate column name" when the column already exists and
/// that error is silently discarded, making migrations safe to run on every
/// open.
fn migrate(conn: &Connection) {
    // LD-40: workspace scoping for chat sessions.
    let _ = conn.execute("ALTER TABLE chat_sessions ADD COLUMN workspace TEXT", []);
}

/// Opens (or creates) the database at `db_path` and ensures tables exist.
pub fn open(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| rusqlite::Error::InvalidPath(std::path::PathBuf::from(e.to_string())))?;
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn);
    scrum::init_scrum_schema(&conn)
        .map_err(|e| rusqlite::Error::InvalidPath(std::path::PathBuf::from(e)))?;
    Ok(conn)
}

/// Opens an in-memory database with the standard schema — useful for tests.
pub fn open_in_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn);
    scrum::init_scrum_schema(&conn)
        .map_err(|e| rusqlite::Error::InvalidPath(std::path::PathBuf::from(e)))?;
    Ok(conn)
}

// ── Settings ─────────────────────────────────────────────────────────────────

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

// ── Chat sessions ────────────────────────────────────────────────────────────

/// A chat session (conversation thread).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    /// Workspace path this session belongs to. `None` means the session has no
    /// workspace scope and is visible in every workspace (backward-compat).
    pub workspace: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Creates a new chat session. Returns the created session.
///
/// `workspace` — when `Some`, the session is scoped to that workspace path.
/// When `None`, the session is global and visible in every workspace.
pub fn session_create(
    conn: &Connection,
    id: &str,
    title: &str,
    workspace: Option<&str>,
) -> Result<ChatSession> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO chat_sessions (id, title, workspace, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, title, workspace, now],
    )?;
    Ok(ChatSession {
        id: id.to_string(),
        title: title.to_string(),
        workspace: workspace.map(str::to_string),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Lists sessions ordered by most recently updated first.
///
/// Scoping rules:
/// - `workspace = None`    → return **all** sessions regardless of workspace.
/// - `workspace = Some(w)` → return sessions scoped to `w` **plus** sessions
///   whose `workspace` is `NULL` (global sessions, backward-compat).
pub fn session_list(conn: &Connection, workspace: Option<&str>) -> Result<Vec<ChatSession>> {
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ChatSession> {
        Ok(ChatSession {
            id: row.get(0)?,
            title: row.get(1)?,
            workspace: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    };

    match workspace {
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, title, workspace, created_at, updated_at
                 FROM chat_sessions
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], map_row)?;
            rows.collect()
        }
        Some(ws) => {
            let mut stmt = conn.prepare(
                "SELECT id, title, workspace, created_at, updated_at
                 FROM chat_sessions
                 WHERE workspace = ?1 OR workspace IS NULL
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map(params![ws], map_row)?;
            rows.collect()
        }
    }
}

/// Renames a session.
pub fn session_rename(conn: &Connection, id: &str, title: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chat_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    Ok(())
}

/// Deletes a session and all its messages.
pub fn session_delete(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM chat_sessions WHERE id = ?1", params![id])?;
    Ok(())
}

/// Touches the session's updated_at timestamp.
pub fn session_touch(conn: &Connection, id: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

// ── Chat messages ────────────────────────────────────────────────────────────

/// A single chat message stored in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub created_at: String,
}

/// Inserts a new chat message. Ignores conflicts (idempotent by id).
/// Also touches the parent session's updated_at.
pub fn chat_insert(
    conn: &Connection,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    timestamp: i64,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO chat_messages (id, session_id, role, content, timestamp, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, session_id, role, content, timestamp, now],
    )?;
    session_touch(conn, session_id)?;
    Ok(())
}

/// Returns up to `limit` most recent messages for a given session, ordered oldest-first.
pub fn chat_list(conn: &Connection, session_id: &str, limit: i64) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, timestamp, created_at
         FROM chat_messages
         WHERE session_id = ?1
         ORDER BY timestamp DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![session_id, limit], |row| {
        Ok(ChatMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut messages: Vec<ChatMessage> = rows.filter_map(|r| r.ok()).collect();
    messages.reverse();
    Ok(messages)
}

/// Deletes all chat messages for a given session.
pub fn chat_clear(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ?1",
        params![session_id],
    )?;
    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        open_in_memory().expect("in-memory DB")
    }

    // ── settings ──────────────────────────────────────────────────────────

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

    // ── chat sessions ─────────────────────────────────────────────────────

    #[test]
    fn session_create_and_list() {
        let conn = mem();
        session_create(&conn, "s1", "My session", None).unwrap();
        let sessions = session_list(&conn, None).unwrap();
        assert!(sessions
            .iter()
            .any(|s| s.id == "s1" && s.title == "My session"));
    }

    #[test]
    fn session_rename_updates_title() {
        let conn = mem();
        session_create(&conn, "sr", "Old", None).unwrap();
        session_rename(&conn, "sr", "New").unwrap();
        let s = session_list(&conn, None).unwrap();
        assert_eq!(s.iter().find(|s| s.id == "sr").unwrap().title, "New");
    }

    #[test]
    fn session_delete_removes_session_and_messages() {
        let conn = mem();
        session_create(&conn, "sd", "Del", None).unwrap();
        chat_insert(&conn, "m1", "sd", "user", "hi", 1000).unwrap();
        session_delete(&conn, "sd").unwrap();
        assert!(!session_list(&conn, None)
            .unwrap()
            .iter()
            .any(|s| s.id == "sd"));
        assert!(chat_list(&conn, "sd", 100).unwrap().is_empty());
    }

    #[test]
    fn chat_session_workspace_scoped() {
        let conn = mem();
        session_create(&conn, "ws-a-1", "Alpha chat", Some("/workspaces/alpha")).unwrap();
        session_create(&conn, "ws-b-1", "Beta chat", Some("/workspaces/beta")).unwrap();

        let alpha = session_list(&conn, Some("/workspaces/alpha")).unwrap();
        assert!(
            alpha.iter().any(|s| s.id == "ws-a-1"),
            "alpha session should appear in alpha list"
        );
        assert!(
            !alpha.iter().any(|s| s.id == "ws-b-1"),
            "beta session must not appear in alpha list"
        );

        let beta = session_list(&conn, Some("/workspaces/beta")).unwrap();
        assert!(
            beta.iter().any(|s| s.id == "ws-b-1"),
            "beta session should appear in beta list"
        );
        assert!(
            !beta.iter().any(|s| s.id == "ws-a-1"),
            "alpha session must not appear in beta list"
        );
    }

    #[test]
    fn chat_session_null_workspace_visible_everywhere() {
        let conn = mem();
        // NULL workspace = global; must appear when filtering by any workspace.
        session_create(&conn, "global-1", "Global chat", None).unwrap();
        session_create(&conn, "scoped-1", "Scoped chat", Some("/workspaces/foo")).unwrap();

        let foo = session_list(&conn, Some("/workspaces/foo")).unwrap();
        assert!(
            foo.iter().any(|s| s.id == "global-1"),
            "global session must be visible in foo workspace"
        );
        assert!(
            foo.iter().any(|s| s.id == "scoped-1"),
            "scoped session must be visible in foo workspace"
        );

        let bar = session_list(&conn, Some("/workspaces/bar")).unwrap();
        assert!(
            bar.iter().any(|s| s.id == "global-1"),
            "global session must be visible in bar workspace"
        );
        assert!(
            !bar.iter().any(|s| s.id == "scoped-1"),
            "foo-scoped session must not appear in bar workspace"
        );
    }

    // ── chat messages ─────────────────────────────────────────────────────

    #[test]
    fn chat_insert_and_list_in_order() {
        let conn = mem();
        chat_insert(&conn, "m1", "default", "user", "first", 1000).unwrap();
        chat_insert(&conn, "m2", "default", "assistant", "second", 2000).unwrap();
        let msgs = chat_list(&conn, "default", 10).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].id, "m1");
        assert_eq!(msgs[1].id, "m2");
    }

    #[test]
    fn chat_insert_is_idempotent() {
        let conn = mem();
        chat_insert(&conn, "dup", "default", "user", "orig", 1000).unwrap();
        chat_insert(&conn, "dup", "default", "user", "dupe", 2000).unwrap();
        let msgs = chat_list(&conn, "default", 10).unwrap();
        let dups: Vec<_> = msgs.iter().filter(|m| m.id == "dup").collect();
        assert_eq!(dups.len(), 1);
        assert_eq!(dups[0].content, "orig");
    }

    #[test]
    fn chat_clear_removes_all() {
        let conn = mem();
        chat_insert(&conn, "c1", "default", "user", "a", 1000).unwrap();
        chat_clear(&conn, "default").unwrap();
        assert!(chat_list(&conn, "default", 100).unwrap().is_empty());
    }

    #[test]
    fn chat_list_respects_limit() {
        let conn = mem();
        for i in 0..10_i64 {
            chat_insert(&conn, &format!("l{i}"), "default", "user", "m", i * 100).unwrap();
        }
        assert_eq!(chat_list(&conn, "default", 3).unwrap().len(), 3);
    }

    #[test]
    fn open_creates_db_on_disk() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_file = dir.path().join("test.db");
        let conn = open(&db_file).expect("open");
        set_setting(&conn, "check", "ok").unwrap();
        assert_eq!(get_setting(&conn, "check").unwrap(), Some("ok".into()));
        assert!(db_file.exists());
    }
}
