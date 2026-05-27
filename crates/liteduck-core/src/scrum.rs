//! SQLite-based storage for Scrum entities.
//!
//! All functions accept a `&Connection` so the caller controls where the
//! database lives.  Call `init_scrum_schema` once after opening the connection
//! to create the required tables.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub workspace_directory: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct NewProject {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub workspace_directory: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct Epic {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct NewEpic {
    pub project_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct Story {
    pub id: i64,
    pub epic_id: Option<i64>,
    pub project_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub status: String,
    pub priority: String,
    pub points: Option<i64>,
    pub assignee: Option<String>,
    pub dlc_phase: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct NewStory {
    pub epic_id: Option<i64>,
    pub project_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub points: Option<i64>,
    pub assignee: Option<String>,
    pub dlc_phase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct Sprint {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub goal: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct NewSprint {
    pub project_id: i64,
    pub name: String,
    pub goal: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct Task {
    pub id: i64,
    pub story_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct NewTask {
    pub story_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct KanbanColumn {
    pub status: String,
    pub stories: Vec<Story>,
}

#[derive(Debug, Serialize, Deserialize, Clone, uniffi::Record)]
pub struct KanbanBoard {
    pub project_id: i64,
    pub columns: Vec<KanbanColumn>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SprintBoard {
    pub sprint: Sprint,
    pub stories: Vec<Story>,
}

// ── Schema ───────────────────────────────────────────────────────────────────

const SCRUM_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS scrum_projects (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    key                 TEXT NOT NULL,
    description         TEXT,
    workspace_directory TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scrum_epics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    priority    TEXT NOT NULL DEFAULT 'medium',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scrum_stories (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    epic_id             INTEGER,
    project_id          INTEGER NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    acceptance_criteria TEXT,
    status              TEXT NOT NULL DEFAULT 'plan',
    priority            TEXT NOT NULL DEFAULT 'medium',
    points              INTEGER,
    assignee            TEXT,
    dlc_phase           TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scrum_sprints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    name        TEXT NOT NULL,
    goal        TEXT,
    start_date  TEXT,
    end_date    TEXT,
    status      TEXT NOT NULL DEFAULT 'planned',
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scrum_sprint_items (
    sprint_id  INTEGER NOT NULL,
    story_id   INTEGER NOT NULL,
    PRIMARY KEY (sprint_id, story_id)
);
CREATE TABLE IF NOT EXISTS scrum_tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id         INTEGER NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'todo',
    estimated_hours  REAL,
    actual_hours     REAL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
";

/// Creates all scrum tables.  Safe to call multiple times (uses `IF NOT EXISTS`).
pub fn init_scrum_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCRUM_SCHEMA)
        .map_err(|e| format!("Failed to initialise scrum schema: {e}"))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn now_utc() -> String {
    Utc::now().to_rfc3339()
}

type Err = String;

fn map_err(e: rusqlite::Error) -> Err {
    e.to_string()
}

// ── Row mappers ──────────────────────────────────────────────────────────────

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        key: row.get(2)?,
        description: row.get(3)?,
        workspace_directory: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn row_to_epic(row: &rusqlite::Row) -> rusqlite::Result<Epic> {
    Ok(Epic {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        status: row.get(4)?,
        priority: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn row_to_story(row: &rusqlite::Row) -> rusqlite::Result<Story> {
    Ok(Story {
        id: row.get(0)?,
        epic_id: row.get(1)?,
        project_id: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        acceptance_criteria: row.get(5)?,
        status: row.get(6)?,
        priority: row.get(7)?,
        points: row.get(8)?,
        assignee: row.get(9)?,
        dlc_phase: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_sprint(row: &rusqlite::Row) -> rusqlite::Result<Sprint> {
    Ok(Sprint {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        goal: row.get(3)?,
        start_date: row.get(4)?,
        end_date: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        story_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        status: row.get(4)?,
        estimated_hours: row.get(5)?,
        actual_hours: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

// ── Project ──────────────────────────────────────────────────────────────────

pub fn project_create(conn: &Connection, input: NewProject) -> Result<Project, Err> {
    let now = now_utc();
    conn.execute(
        "INSERT INTO scrum_projects (name, key, description, workspace_directory, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![input.name, input.key, input.description, input.workspace_directory, now],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    project_get_by_id(conn, id)
}

/// Returns the first project in the database (legacy single-project behaviour).
pub fn project_get(conn: &Connection) -> Result<Project, Err> {
    conn.query_row(
        "SELECT id, name, key, description, workspace_directory, created_at, updated_at
         FROM scrum_projects
         ORDER BY id ASC
         LIMIT 1",
        [],
        row_to_project,
    )
    .map_err(|_| "No project found".into())
}

fn project_get_by_id(conn: &Connection, id: i64) -> Result<Project, Err> {
    conn.query_row(
        "SELECT id, name, key, description, workspace_directory, created_at, updated_at
         FROM scrum_projects
         WHERE id = ?1",
        params![id],
        row_to_project,
    )
    .map_err(|e| format!("Project {id} not found: {e}"))
}

/// Lists all projects.  When `workspace_directory` is `Some`, only projects
/// whose `workspace_directory` matches (or is NULL) are returned.
pub fn project_list(
    conn: &Connection,
    workspace_directory: Option<&str>,
) -> Result<Vec<Project>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, key, description, workspace_directory, created_at, updated_at
             FROM scrum_projects
             ORDER BY id ASC",
        )
        .map_err(map_err)?;

    let rows = stmt.query_map([], row_to_project).map_err(map_err)?;

    let mut projects = Vec::new();
    for row in rows {
        let p = row.map_err(map_err)?;
        if let Some(filter) = workspace_directory {
            // Include only if workspace_directory is NULL or matches the filter.
            let visible = p
                .workspace_directory
                .as_deref()
                .is_none_or(|dir| dir == filter);
            if !visible {
                continue;
            }
        }
        projects.push(p);
    }
    Ok(projects)
}

pub fn project_update(conn: &Connection, input: NewProject) -> Result<Project, Err> {
    let p = project_get(conn)?;
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_projects
         SET name = ?1, key = ?2, description = ?3, updated_at = ?4
         WHERE id = ?5",
        params![input.name, input.key, input.description, now, p.id],
    )
    .map_err(map_err)?;
    project_get_by_id(conn, p.id)
}

/// Deletes ALL projects (and all related data via cascade if set up, or
/// individually here).  Mirrors the original "delete the whole workspace dir"
/// semantics.
pub fn project_delete(conn: &Connection) -> Result<(), Err> {
    conn.execute_batch(
        "DELETE FROM scrum_sprint_items;
         DELETE FROM scrum_tasks;
         DELETE FROM scrum_stories;
         DELETE FROM scrum_epics;
         DELETE FROM scrum_sprints;
         DELETE FROM scrum_projects;",
    )
    .map_err(map_err)
}

// ── Epic ─────────────────────────────────────────────────────────────────────

pub fn epic_create(conn: &Connection, input: NewEpic) -> Result<Epic, Err> {
    let now = now_utc();
    let status = input.status.unwrap_or_else(|| "open".into());
    let priority = input.priority.unwrap_or_else(|| "medium".into());
    conn.execute(
        "INSERT INTO scrum_epics (project_id, title, description, status, priority, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![input.project_id, input.title, input.description, status, priority, now],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    epic_get(conn, id)
}

pub fn epic_get(conn: &Connection, id: i64) -> Result<Epic, Err> {
    conn.query_row(
        "SELECT id, project_id, title, description, status, priority, created_at, updated_at
         FROM scrum_epics
         WHERE id = ?1",
        params![id],
        row_to_epic,
    )
    .map_err(|e| format!("Epic {id} not found: {e}"))
}

pub fn epic_list(conn: &Connection, project_id: i64) -> Result<Vec<Epic>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, description, status, priority, created_at, updated_at
             FROM scrum_epics
             WHERE project_id = ?1
             ORDER BY id ASC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![project_id], row_to_epic)
        .map_err(map_err)?;
    rows.map(|r| r.map_err(map_err)).collect()
}

pub fn epic_update(conn: &Connection, id: i64, input: NewEpic) -> Result<Epic, Err> {
    let existing = epic_get(conn, id)?;
    let now = now_utc();
    let status = input.status.unwrap_or(existing.status);
    let priority = input.priority.unwrap_or(existing.priority);
    conn.execute(
        "UPDATE scrum_epics
         SET title = ?1, description = ?2, status = ?3, priority = ?4, updated_at = ?5
         WHERE id = ?6",
        params![input.title, input.description, status, priority, now, id],
    )
    .map_err(map_err)?;
    epic_get(conn, id)
}

pub fn epic_update_status(conn: &Connection, id: i64, status: &str) -> Result<Epic, Err> {
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_epics SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, id],
    )
    .map_err(map_err)?;
    epic_get(conn, id)
}

pub fn epic_delete(conn: &Connection, id: i64) -> Result<(), Err> {
    conn.execute("DELETE FROM scrum_epics WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

// ── Story ────────────────────────────────────────────────────────────────────

pub fn story_create(conn: &Connection, input: NewStory) -> Result<Story, Err> {
    let now = now_utc();
    let status = input.status.unwrap_or_else(|| "plan".into());
    let priority = input.priority.unwrap_or_else(|| "medium".into());
    conn.execute(
        "INSERT INTO scrum_stories
             (epic_id, project_id, title, description, acceptance_criteria,
              status, priority, points, assignee, dlc_phase, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![
            input.epic_id,
            input.project_id,
            input.title,
            input.description,
            input.acceptance_criteria,
            status,
            priority,
            input.points,
            input.assignee,
            input.dlc_phase,
            now,
        ],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    story_get(conn, id)
}

pub fn story_get(conn: &Connection, id: i64) -> Result<Story, Err> {
    conn.query_row(
        "SELECT id, epic_id, project_id, title, description, acceptance_criteria,
                status, priority, points, assignee, dlc_phase, created_at, updated_at
         FROM scrum_stories
         WHERE id = ?1",
        params![id],
        row_to_story,
    )
    .map_err(|e| format!("Story {id} not found: {e}"))
}

pub fn story_list(conn: &Connection, project_id: i64) -> Result<Vec<Story>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, epic_id, project_id, title, description, acceptance_criteria,
                    status, priority, points, assignee, dlc_phase, created_at, updated_at
             FROM scrum_stories
             WHERE project_id = ?1
             ORDER BY id ASC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![project_id], row_to_story)
        .map_err(map_err)?;
    rows.map(|r| r.map_err(map_err)).collect()
}

pub fn story_update(conn: &Connection, id: i64, input: NewStory) -> Result<Story, Err> {
    let existing = story_get(conn, id)?;
    let now = now_utc();
    let status = input.status.unwrap_or(existing.status);
    let priority = input.priority.unwrap_or(existing.priority);
    conn.execute(
        "UPDATE scrum_stories
         SET epic_id = ?1, project_id = ?2, title = ?3, description = ?4,
             acceptance_criteria = ?5, status = ?6, priority = ?7,
             points = ?8, assignee = ?9, dlc_phase = ?10, updated_at = ?11
         WHERE id = ?12",
        params![
            input.epic_id,
            input.project_id,
            input.title,
            input.description,
            input.acceptance_criteria,
            status,
            priority,
            input.points,
            input.assignee,
            input.dlc_phase,
            now,
            id,
        ],
    )
    .map_err(map_err)?;
    story_get(conn, id)
}

pub fn story_update_status(
    conn: &Connection,
    id: i64,
    status: &str,
    dlc_phase: Option<&str>,
) -> Result<Story, Err> {
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_stories
         SET status = ?1, dlc_phase = COALESCE(?2, dlc_phase), updated_at = ?3
         WHERE id = ?4",
        params![status, dlc_phase, now, id],
    )
    .map_err(map_err)?;
    story_get(conn, id)
}

pub fn story_update_points(conn: &Connection, id: i64, points: Option<i64>) -> Result<Story, Err> {
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_stories SET points = ?1, updated_at = ?2 WHERE id = ?3",
        params![points, now, id],
    )
    .map_err(map_err)?;
    story_get(conn, id)
}

pub fn story_assign(conn: &Connection, id: i64, assignee: Option<&str>) -> Result<Story, Err> {
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_stories SET assignee = ?1, updated_at = ?2 WHERE id = ?3",
        params![assignee, now, id],
    )
    .map_err(map_err)?;
    story_get(conn, id)
}

pub fn story_delete(conn: &Connection, id: i64) -> Result<(), Err> {
    // Remove from any sprints first.
    conn.execute(
        "DELETE FROM scrum_sprint_items WHERE story_id = ?1",
        params![id],
    )
    .map_err(map_err)?;
    conn.execute("DELETE FROM scrum_stories WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

// ── Sprint ───────────────────────────────────────────────────────────────────

pub fn sprint_create(conn: &Connection, input: NewSprint) -> Result<Sprint, Err> {
    let now = now_utc();
    conn.execute(
        "INSERT INTO scrum_sprints (project_id, name, goal, start_date, end_date, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'planned', ?6)",
        params![
            input.project_id,
            input.name,
            input.goal,
            input.start_date,
            input.end_date,
            now,
        ],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    sprint_get(conn, id)
}

pub fn sprint_get(conn: &Connection, id: i64) -> Result<Sprint, Err> {
    conn.query_row(
        "SELECT id, project_id, name, goal, start_date, end_date, status, created_at
         FROM scrum_sprints
         WHERE id = ?1",
        params![id],
        row_to_sprint,
    )
    .map_err(|e| format!("Sprint {id} not found: {e}"))
}

pub fn sprint_list(conn: &Connection, project_id: i64) -> Result<Vec<Sprint>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, goal, start_date, end_date, status, created_at
             FROM scrum_sprints
             WHERE project_id = ?1
             ORDER BY id ASC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![project_id], row_to_sprint)
        .map_err(map_err)?;
    rows.map(|r| r.map_err(map_err)).collect()
}

pub fn sprint_start(conn: &Connection, id: i64) -> Result<Sprint, Err> {
    let s = sprint_get(conn, id)?;
    let start_date = s.start_date.unwrap_or_else(now_utc);
    conn.execute(
        "UPDATE scrum_sprints SET status = 'active', start_date = ?1 WHERE id = ?2",
        params![start_date, id],
    )
    .map_err(map_err)?;
    sprint_get(conn, id)
}

pub fn sprint_close(conn: &Connection, id: i64) -> Result<Sprint, Err> {
    let s = sprint_get(conn, id)?;
    let end_date = s.end_date.unwrap_or_else(now_utc);
    conn.execute(
        "UPDATE scrum_sprints SET status = 'completed', end_date = ?1 WHERE id = ?2",
        params![end_date, id],
    )
    .map_err(map_err)?;
    sprint_get(conn, id)
}

pub fn sprint_delete(conn: &Connection, id: i64) -> Result<(), Err> {
    conn.execute(
        "DELETE FROM scrum_sprint_items WHERE sprint_id = ?1",
        params![id],
    )
    .map_err(map_err)?;
    conn.execute("DELETE FROM scrum_sprints WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

pub fn sprint_add_item(conn: &Connection, sprint_id: i64, story_id: i64) -> Result<(), Err> {
    conn.execute(
        "INSERT OR IGNORE INTO scrum_sprint_items (sprint_id, story_id) VALUES (?1, ?2)",
        params![sprint_id, story_id],
    )
    .map_err(map_err)?;
    Ok(())
}

pub fn sprint_remove_item(conn: &Connection, sprint_id: i64, story_id: i64) -> Result<(), Err> {
    conn.execute(
        "DELETE FROM scrum_sprint_items WHERE sprint_id = ?1 AND story_id = ?2",
        params![sprint_id, story_id],
    )
    .map_err(map_err)?;
    Ok(())
}

// ── Task ─────────────────────────────────────────────────────────────────────

pub fn task_create(conn: &Connection, input: NewTask) -> Result<Task, Err> {
    let now = now_utc();
    let status = input.status.unwrap_or_else(|| "todo".into());
    conn.execute(
        "INSERT INTO scrum_tasks
             (story_id, title, description, status, estimated_hours, actual_hours, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            input.story_id,
            input.title,
            input.description,
            status,
            input.estimated_hours,
            input.actual_hours,
            now,
        ],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    task_get(conn, id)
}

pub fn task_get(conn: &Connection, id: i64) -> Result<Task, Err> {
    conn.query_row(
        "SELECT id, story_id, title, description, status, estimated_hours, actual_hours,
                created_at, updated_at
         FROM scrum_tasks
         WHERE id = ?1",
        params![id],
        row_to_task,
    )
    .map_err(|e| format!("Task {id} not found: {e}"))
}

pub fn task_list(conn: &Connection, story_id: i64) -> Result<Vec<Task>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, story_id, title, description, status, estimated_hours, actual_hours,
                    created_at, updated_at
             FROM scrum_tasks
             WHERE story_id = ?1
             ORDER BY id ASC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![story_id], row_to_task)
        .map_err(map_err)?;
    rows.map(|r| r.map_err(map_err)).collect()
}

pub fn task_update(conn: &Connection, id: i64, input: NewTask) -> Result<Task, Err> {
    let existing = task_get(conn, id)?;
    let now = now_utc();
    let status = input.status.unwrap_or(existing.status);
    conn.execute(
        "UPDATE scrum_tasks
         SET title = ?1, description = ?2, status = ?3,
             estimated_hours = ?4, actual_hours = ?5, updated_at = ?6
         WHERE id = ?7",
        params![
            input.title,
            input.description,
            status,
            input.estimated_hours,
            input.actual_hours,
            now,
            id,
        ],
    )
    .map_err(map_err)?;
    task_get(conn, id)
}

pub fn task_update_status(conn: &Connection, id: i64, status: &str) -> Result<Task, Err> {
    let now = now_utc();
    conn.execute(
        "UPDATE scrum_tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, id],
    )
    .map_err(map_err)?;
    task_get(conn, id)
}

pub fn task_delete(conn: &Connection, id: i64) -> Result<(), Err> {
    conn.execute("DELETE FROM scrum_tasks WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

// ── Kanban Board ─────────────────────────────────────────────────────────────

const KANBAN_STATUSES: &[&str] = &["plan", "develop", "test", "qa", "done"];

pub fn get_kanban_view(conn: &Connection, project_id: i64) -> Result<KanbanBoard, Err> {
    let stories = story_list(conn, project_id)?;
    let mut columns: Vec<KanbanColumn> = KANBAN_STATUSES
        .iter()
        .map(|s| KanbanColumn {
            status: s.to_string(),
            stories: vec![],
        })
        .collect();

    for story in stories {
        if let Some(col) = columns.iter_mut().find(|c| c.status == story.status) {
            col.stories.push(story);
        } else {
            // Unknown status — add as a new column.
            columns.push(KanbanColumn {
                status: story.status.clone(),
                stories: vec![story],
            });
        }
    }

    Ok(KanbanBoard {
        project_id,
        columns,
    })
}

pub fn get_sprint_board(conn: &Connection, sprint_id: i64) -> Result<SprintBoard, Err> {
    let sprint = sprint_get(conn, sprint_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.epic_id, s.project_id, s.title, s.description,
                    s.acceptance_criteria, s.status, s.priority, s.points,
                    s.assignee, s.dlc_phase, s.created_at, s.updated_at
             FROM scrum_stories s
             INNER JOIN scrum_sprint_items si ON si.story_id = s.id
             WHERE si.sprint_id = ?1
             ORDER BY s.id ASC",
        )
        .map_err(map_err)?;

    let rows = stmt
        .query_map(params![sprint_id], row_to_story)
        .map_err(map_err)?;
    let stories: Vec<Story> = rows.map(|r| r.map_err(map_err)).collect::<Result<_, _>>()?;

    Ok(SprintBoard { sprint, stories })
}

pub fn get_backlog(conn: &Connection, project_id: i64) -> Result<Vec<Story>, Err> {
    let mut stmt = conn
        .prepare(
            "SELECT id, epic_id, project_id, title, description, acceptance_criteria,
                    status, priority, points, assignee, dlc_phase, created_at, updated_at
             FROM scrum_stories
             WHERE project_id = ?1 AND status = 'plan'
             ORDER BY id ASC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![project_id], row_to_story)
        .map_err(map_err)?;
    rows.map(|r| r.map_err(map_err)).collect()
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        init_scrum_schema(&conn).expect("init scrum schema");
        conn
    }

    // ── Project ───────────────────────────────────────────────────────────────

    #[test]
    fn project_create_and_get() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "Alpha".into(),
                key: "ALP".into(),
                description: Some("desc".into()),
                workspace_directory: None,
            },
        )
        .unwrap();
        assert!(p.id > 0);
        assert_eq!(p.name, "Alpha");
        assert_eq!(p.key, "ALP");

        let fetched = project_get(&conn).unwrap();
        assert_eq!(fetched.id, p.id);
        assert_eq!(fetched.name, "Alpha");
    }

    #[test]
    fn project_list_without_filter_returns_all() {
        let conn = mem();
        project_create(
            &conn,
            NewProject {
                name: "P1".into(),
                key: "P1".into(),
                description: None,
                workspace_directory: Some("/ws/a".into()),
            },
        )
        .unwrap();
        project_create(
            &conn,
            NewProject {
                name: "P2".into(),
                key: "P2".into(),
                description: None,
                workspace_directory: Some("/ws/b".into()),
            },
        )
        .unwrap();

        let all = project_list(&conn, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn project_list_with_workspace_filter() {
        let conn = mem();
        project_create(
            &conn,
            NewProject {
                name: "Visible".into(),
                key: "VIS".into(),
                description: None,
                workspace_directory: Some("/ws/target".into()),
            },
        )
        .unwrap();
        project_create(
            &conn,
            NewProject {
                name: "Other".into(),
                key: "OTH".into(),
                description: None,
                workspace_directory: Some("/ws/other".into()),
            },
        )
        .unwrap();

        let filtered = project_list(&conn, Some("/ws/target")).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "Visible");
    }

    #[test]
    fn project_list_null_workspace_directory_visible_everywhere() {
        let conn = mem();
        project_create(
            &conn,
            NewProject {
                name: "Global".into(),
                key: "GLO".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let filtered = project_list(&conn, Some("/ws/any")).unwrap();
        assert_eq!(
            filtered.len(),
            1,
            "NULL workspace_directory should always show"
        );
    }

    #[test]
    fn project_update_changes_fields() {
        let conn = mem();
        project_create(
            &conn,
            NewProject {
                name: "Old".into(),
                key: "OLD".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let updated = project_update(
            &conn,
            NewProject {
                name: "New".into(),
                key: "NEW".into(),
                description: Some("updated desc".into()),
                workspace_directory: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "New");
        assert_eq!(updated.key, "NEW");
        assert_eq!(updated.description, Some("updated desc".into()));
    }

    #[test]
    fn project_delete_removes_all() {
        let conn = mem();
        project_create(
            &conn,
            NewProject {
                name: "ToDelete".into(),
                key: "DEL".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        project_delete(&conn).unwrap();
        assert!(project_list(&conn, None).unwrap().is_empty());
    }

    // ── Epic ──────────────────────────────────────────────────────────────────

    #[test]
    fn epic_create_and_get() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let e = epic_create(
            &conn,
            NewEpic {
                project_id: p.id,
                title: "Big Epic".into(),
                description: Some("lots".into()),
                status: None,
                priority: None,
            },
        )
        .unwrap();

        assert!(e.id > 0);
        assert_eq!(e.status, "open");
        assert_eq!(e.priority, "medium");

        let fetched = epic_get(&conn, e.id).unwrap();
        assert_eq!(fetched.title, "Big Epic");
    }

    #[test]
    fn epic_list_filters_by_project() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        epic_create(
            &conn,
            NewEpic {
                project_id: p.id,
                title: "E1".into(),
                description: None,
                status: None,
                priority: None,
            },
        )
        .unwrap();
        epic_create(
            &conn,
            NewEpic {
                project_id: p.id,
                title: "E2".into(),
                description: None,
                status: None,
                priority: None,
            },
        )
        .unwrap();

        let epics = epic_list(&conn, p.id).unwrap();
        assert_eq!(epics.len(), 2);
    }

    #[test]
    fn epic_update_and_update_status() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let e = epic_create(
            &conn,
            NewEpic {
                project_id: p.id,
                title: "E".into(),
                description: None,
                status: None,
                priority: None,
            },
        )
        .unwrap();

        let updated = epic_update(
            &conn,
            e.id,
            NewEpic {
                project_id: p.id,
                title: "E Updated".into(),
                description: Some("desc".into()),
                status: Some("in-progress".into()),
                priority: Some("high".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.title, "E Updated");
        assert_eq!(updated.status, "in-progress");

        let closed = epic_update_status(&conn, e.id, "done").unwrap();
        assert_eq!(closed.status, "done");
    }

    #[test]
    fn epic_delete_removes_record() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let e = epic_create(
            &conn,
            NewEpic {
                project_id: p.id,
                title: "Del".into(),
                description: None,
                status: None,
                priority: None,
            },
        )
        .unwrap();
        epic_delete(&conn, e.id).unwrap();
        assert!(epic_get(&conn, e.id).is_err());
    }

    // ── Story ─────────────────────────────────────────────────────────────────

    #[test]
    fn story_create_and_get() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "Do the thing".into(),
                description: Some("details".into()),
                acceptance_criteria: Some("must work".into()),
                status: None,
                priority: Some("high".into()),
                points: Some(5),
                assignee: Some("bob".into()),
                dlc_phase: None,
            },
        )
        .unwrap();

        assert!(s.id > 0);
        assert_eq!(s.status, "plan");
        assert_eq!(s.priority, "high");
        assert_eq!(s.points, Some(5));

        let fetched = story_get(&conn, s.id).unwrap();
        assert_eq!(fetched.title, "Do the thing");
        assert_eq!(fetched.assignee, Some("bob".into()));
    }

    #[test]
    fn story_list_filters_by_project() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        for i in 0..3 {
            story_create(
                &conn,
                NewStory {
                    epic_id: None,
                    project_id: p.id,
                    title: format!("Story {i}"),
                    description: None,
                    acceptance_criteria: None,
                    status: None,
                    priority: None,
                    points: None,
                    assignee: None,
                    dlc_phase: None,
                },
            )
            .unwrap();
        }

        assert_eq!(story_list(&conn, p.id).unwrap().len(), 3);
        assert_eq!(story_list(&conn, 9999).unwrap().len(), 0);
    }

    #[test]
    fn story_update_status_and_points_and_assign() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();

        let s2 = story_update_status(&conn, s.id, "in-progress", Some("build")).unwrap();
        assert_eq!(s2.status, "in-progress");
        assert_eq!(s2.dlc_phase, Some("build".into()));

        let s3 = story_update_points(&conn, s.id, Some(8)).unwrap();
        assert_eq!(s3.points, Some(8));

        let s4 = story_assign(&conn, s.id, Some("alice")).unwrap();
        assert_eq!(s4.assignee, Some("alice".into()));
    }

    #[test]
    fn story_delete_removes_sprint_items() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();
        let sp = sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "Sp".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();
        sprint_add_item(&conn, sp.id, s.id).unwrap();

        story_delete(&conn, s.id).unwrap();
        assert!(story_get(&conn, s.id).is_err());

        // Sprint item should also be gone.
        let board = get_sprint_board(&conn, sp.id).unwrap();
        assert!(board.stories.is_empty());
    }

    // ── Sprint ────────────────────────────────────────────────────────────────

    #[test]
    fn sprint_create_and_get() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let sp = sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "Sprint 1".into(),
                goal: Some("ship it".into()),
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();

        assert!(sp.id > 0);
        assert_eq!(sp.name, "Sprint 1");
        assert_eq!(sp.status, "planned");

        let fetched = sprint_get(&conn, sp.id).unwrap();
        assert_eq!(fetched.goal, Some("ship it".into()));
    }

    #[test]
    fn sprint_list_filters_by_project() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "S1".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();
        sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "S2".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();

        assert_eq!(sprint_list(&conn, p.id).unwrap().len(), 2);
    }

    #[test]
    fn sprint_start_and_close_transitions() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let sp = sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "Sp".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();

        let started = sprint_start(&conn, sp.id).unwrap();
        assert_eq!(started.status, "active");
        assert!(started.start_date.is_some());

        let closed = sprint_close(&conn, sp.id).unwrap();
        assert_eq!(closed.status, "completed");
        assert!(closed.end_date.is_some());
    }

    #[test]
    fn sprint_add_and_remove_item() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();
        let sp = sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "Sp".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();

        sprint_add_item(&conn, sp.id, s.id).unwrap();
        let board = get_sprint_board(&conn, sp.id).unwrap();
        assert_eq!(board.stories.len(), 1);

        sprint_remove_item(&conn, sp.id, s.id).unwrap();
        let board2 = get_sprint_board(&conn, sp.id).unwrap();
        assert!(board2.stories.is_empty());
    }

    #[test]
    fn sprint_delete_removes_sprint_and_items() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let sp = sprint_create(
            &conn,
            NewSprint {
                project_id: p.id,
                name: "Del".into(),
                goal: None,
                start_date: None,
                end_date: None,
            },
        )
        .unwrap();
        sprint_delete(&conn, sp.id).unwrap();
        assert!(sprint_get(&conn, sp.id).is_err());
    }

    // ── Task ──────────────────────────────────────────────────────────────────

    #[test]
    fn task_create_and_get() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();

        let t = task_create(
            &conn,
            NewTask {
                story_id: s.id,
                title: "Write tests".into(),
                description: Some("lots of them".into()),
                status: None,
                estimated_hours: Some(2.5),
                actual_hours: None,
            },
        )
        .unwrap();

        assert!(t.id > 0);
        assert_eq!(t.status, "todo");
        assert_eq!(t.estimated_hours, Some(2.5));

        let fetched = task_get(&conn, t.id).unwrap();
        assert_eq!(fetched.title, "Write tests");
    }

    #[test]
    fn task_list_filters_by_story() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();

        for i in 0..4 {
            task_create(
                &conn,
                NewTask {
                    story_id: s.id,
                    title: format!("T{i}"),
                    description: None,
                    status: None,
                    estimated_hours: None,
                    actual_hours: None,
                },
            )
            .unwrap();
        }

        assert_eq!(task_list(&conn, s.id).unwrap().len(), 4);
        assert_eq!(task_list(&conn, 9999).unwrap().len(), 0);
    }

    #[test]
    fn task_update_and_update_status() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();
        let t = task_create(
            &conn,
            NewTask {
                story_id: s.id,
                title: "T".into(),
                description: None,
                status: None,
                estimated_hours: Some(1.0),
                actual_hours: None,
            },
        )
        .unwrap();

        let updated = task_update(
            &conn,
            t.id,
            NewTask {
                story_id: s.id,
                title: "T Updated".into(),
                description: Some("desc".into()),
                status: Some("in-progress".into()),
                estimated_hours: Some(2.0),
                actual_hours: Some(1.5),
            },
        )
        .unwrap();
        assert_eq!(updated.title, "T Updated");
        assert_eq!(updated.status, "in-progress");
        assert_eq!(updated.actual_hours, Some(1.5));

        let done = task_update_status(&conn, t.id, "done").unwrap();
        assert_eq!(done.status, "done");
    }

    #[test]
    fn task_delete_removes_record() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();
        let s = story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "S".into(),
                description: None,
                acceptance_criteria: None,
                status: None,
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();
        let t = task_create(
            &conn,
            NewTask {
                story_id: s.id,
                title: "Del".into(),
                description: None,
                status: None,
                estimated_hours: None,
                actual_hours: None,
            },
        )
        .unwrap();
        task_delete(&conn, t.id).unwrap();
        assert!(task_get(&conn, t.id).is_err());
    }

    // ── Kanban / Sprint Board / Backlog ───────────────────────────────────────

    #[test]
    fn get_kanban_view_buckets_stories_by_status() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        let statuses = ["plan", "develop", "test"];
        for st in &statuses {
            story_create(
                &conn,
                NewStory {
                    epic_id: None,
                    project_id: p.id,
                    title: format!("Story in {st}"),
                    description: None,
                    acceptance_criteria: None,
                    status: Some(st.to_string()),
                    priority: None,
                    points: None,
                    assignee: None,
                    dlc_phase: None,
                },
            )
            .unwrap();
        }

        let board = get_kanban_view(&conn, p.id).unwrap();
        assert_eq!(board.project_id, p.id);

        for st in &statuses {
            let col = board.columns.iter().find(|c| c.status == *st).unwrap();
            assert_eq!(col.stories.len(), 1, "column {st} should have 1 story");
        }
    }

    #[test]
    fn get_backlog_returns_only_backlog_stories() {
        let conn = mem();
        let p = project_create(
            &conn,
            NewProject {
                name: "P".into(),
                key: "P".into(),
                description: None,
                workspace_directory: None,
            },
        )
        .unwrap();

        story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "Backlog story".into(),
                description: None,
                acceptance_criteria: None,
                status: None, // defaults to "plan"
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();
        story_create(
            &conn,
            NewStory {
                epic_id: None,
                project_id: p.id,
                title: "Active story".into(),
                description: None,
                acceptance_criteria: None,
                status: Some("in-progress".into()),
                priority: None,
                points: None,
                assignee: None,
                dlc_phase: None,
            },
        )
        .unwrap();

        let backlog = get_backlog(&conn, p.id).unwrap();
        assert_eq!(backlog.len(), 1);
        assert_eq!(backlog[0].title, "Backlog story");
    }
}
