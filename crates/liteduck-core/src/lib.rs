//! liteduck-core — shared business logic for LiteDuck.
//!
//! This crate contains platform-independent logic used by the desktop (Tauri),
//! iOS (UniFFI → Swift), and Android (UniFFI → Kotlin) apps.

pub mod db;
pub mod device_identity;
pub mod scrum;
pub mod settings_store;
pub mod traits;

// UniFFI requires the callback interface traits to be in scope when the
// generated scaffolding is included. Re-export them at crate root.
pub use traits::{EventSink, SecretStore};

// UniFFI scaffolding — generates the FFI glue from liteduck_core.udl.
// The UDL file lives at src/liteduck_core.udl; build.rs feeds it to uniffi.
uniffi::include_scaffolding!("liteduck_core");

// ── LiteduckError: the single error type exposed over the FFI boundary ────────

/// Wraps any String-based error from the core modules into a UniFFI-safe enum.
#[derive(Debug, thiserror::Error)]
pub enum LiteduckError {
    #[error("{message}")]
    General { message: String },
}

impl From<String> for LiteduckError {
    fn from(message: String) -> Self {
        LiteduckError::General { message }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Opens the scrum database located in `<workspace>/.LiteDuck/liteduck.db`.
/// Used by the UniFFI wrappers below so mobile callers only need to pass a
/// workspace path string.
fn open_scrum_conn(workspace: &str) -> Result<rusqlite::Connection, LiteduckError> {
    let db_path = std::path::Path::new(workspace)
        .join(".LiteDuck")
        .join("liteduck.db");
    db::open(&db_path).map_err(|e| LiteduckError::General {
        message: e.to_string(),
    })
}

// ── UniFFI-exported wrappers ──────────────────────────────────────────────────
// The UDL declares free functions; these thin wrappers translate Result<_, String>
// into Result<_, LiteduckError> so UniFFI can map them to the [Error] interface.

// -- device_identity ----------------------------------------------------------

pub fn load_or_create_identity(
    data_dir: String,
) -> Result<device_identity::DeviceIdentity, LiteduckError> {
    device_identity::load_or_create_identity(&data_dir).map_err(LiteduckError::from)
}

pub fn reset_identity(data_dir: String) -> Result<device_identity::DeviceIdentity, LiteduckError> {
    device_identity::reset_identity(&data_dir).map_err(LiteduckError::from)
}

// -- project ------------------------------------------------------------------

pub fn project_create(
    workspace: String,
    input: scrum::NewProject,
) -> Result<scrum::Project, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::project_create(&conn, input).map_err(LiteduckError::from)
}

pub fn project_get(workspace: String) -> Result<scrum::Project, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::project_get(&conn).map_err(LiteduckError::from)
}

pub fn project_list(workspace: String) -> Result<Vec<scrum::Project>, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::project_list(&conn, Some(&workspace)).map_err(LiteduckError::from)
}

pub fn project_update(
    workspace: String,
    input: scrum::NewProject,
) -> Result<scrum::Project, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::project_update(&conn, input).map_err(LiteduckError::from)
}

pub fn project_delete(workspace: String) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::project_delete(&conn).map_err(LiteduckError::from)
}

// -- epic ---------------------------------------------------------------------

pub fn epic_create(workspace: String, input: scrum::NewEpic) -> Result<scrum::Epic, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_create(&conn, input).map_err(LiteduckError::from)
}

pub fn epic_get(workspace: String, id: i64) -> Result<scrum::Epic, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_get(&conn, id).map_err(LiteduckError::from)
}

pub fn epic_list(workspace: String, project_id: i64) -> Result<Vec<scrum::Epic>, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_list(&conn, project_id).map_err(LiteduckError::from)
}

pub fn epic_update(
    workspace: String,
    id: i64,
    input: scrum::NewEpic,
) -> Result<scrum::Epic, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_update(&conn, id, input).map_err(LiteduckError::from)
}

pub fn epic_update_status(
    workspace: String,
    id: i64,
    status: String,
) -> Result<scrum::Epic, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_update_status(&conn, id, &status).map_err(LiteduckError::from)
}

pub fn epic_delete(workspace: String, id: i64) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::epic_delete(&conn, id).map_err(LiteduckError::from)
}

// -- story --------------------------------------------------------------------

pub fn story_create(
    workspace: String,
    input: scrum::NewStory,
) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_create(&conn, input).map_err(LiteduckError::from)
}

pub fn story_get(workspace: String, id: i64) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_get(&conn, id).map_err(LiteduckError::from)
}

pub fn story_list(workspace: String, project_id: i64) -> Result<Vec<scrum::Story>, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_list(&conn, project_id).map_err(LiteduckError::from)
}

pub fn story_update(
    workspace: String,
    id: i64,
    input: scrum::NewStory,
) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_update(&conn, id, input).map_err(LiteduckError::from)
}

pub fn story_update_status(
    workspace: String,
    id: i64,
    status: String,
    dlc_phase: Option<String>,
) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_update_status(&conn, id, &status, dlc_phase.as_deref())
        .map_err(LiteduckError::from)
}

pub fn story_update_points(
    workspace: String,
    id: i64,
    points: Option<i64>,
) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_update_points(&conn, id, points).map_err(LiteduckError::from)
}

pub fn story_assign(
    workspace: String,
    id: i64,
    assignee: Option<String>,
) -> Result<scrum::Story, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_assign(&conn, id, assignee.as_deref()).map_err(LiteduckError::from)
}

pub fn story_delete(workspace: String, id: i64) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::story_delete(&conn, id).map_err(LiteduckError::from)
}

// -- sprint -------------------------------------------------------------------

pub fn sprint_create(
    workspace: String,
    input: scrum::NewSprint,
) -> Result<scrum::Sprint, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_create(&conn, input).map_err(LiteduckError::from)
}

pub fn sprint_get(workspace: String, id: i64) -> Result<scrum::Sprint, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_get(&conn, id).map_err(LiteduckError::from)
}

pub fn sprint_list(
    workspace: String,
    project_id: i64,
) -> Result<Vec<scrum::Sprint>, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_list(&conn, project_id).map_err(LiteduckError::from)
}

pub fn sprint_start(workspace: String, id: i64) -> Result<scrum::Sprint, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_start(&conn, id).map_err(LiteduckError::from)
}

pub fn sprint_close(workspace: String, id: i64) -> Result<scrum::Sprint, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_close(&conn, id).map_err(LiteduckError::from)
}

pub fn sprint_delete(workspace: String, id: i64) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_delete(&conn, id).map_err(LiteduckError::from)
}

pub fn sprint_add_item(
    workspace: String,
    sprint_id: i64,
    story_id: i64,
) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_add_item(&conn, sprint_id, story_id).map_err(LiteduckError::from)
}

pub fn sprint_remove_item(
    workspace: String,
    sprint_id: i64,
    story_id: i64,
) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::sprint_remove_item(&conn, sprint_id, story_id).map_err(LiteduckError::from)
}

// -- task ---------------------------------------------------------------------

pub fn task_create(workspace: String, input: scrum::NewTask) -> Result<scrum::Task, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_create(&conn, input).map_err(LiteduckError::from)
}

pub fn task_get(workspace: String, id: i64) -> Result<scrum::Task, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_get(&conn, id).map_err(LiteduckError::from)
}

pub fn task_list(workspace: String, story_id: i64) -> Result<Vec<scrum::Task>, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_list(&conn, story_id).map_err(LiteduckError::from)
}

pub fn task_update(
    workspace: String,
    id: i64,
    input: scrum::NewTask,
) -> Result<scrum::Task, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_update(&conn, id, input).map_err(LiteduckError::from)
}

pub fn task_update_status(
    workspace: String,
    id: i64,
    status: String,
) -> Result<scrum::Task, LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_update_status(&conn, id, &status).map_err(LiteduckError::from)
}

pub fn task_delete(workspace: String, id: i64) -> Result<(), LiteduckError> {
    let conn = open_scrum_conn(&workspace)?;
    scrum::task_delete(&conn, id).map_err(LiteduckError::from)
}
