use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::pty::{CreateSessionResult, PtyManager, SessionInfo};

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Spawn a new PTY session and return its UUID.
///
/// Pass an empty `cmd` string to use the user's default login shell.
/// `args` may be empty.  `cwd` may be empty to inherit the process working
/// directory.  `session_name` is currently unused; kept for API stability with
/// the frontend, which still forwards a sanitised label.
#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    state: State<'_, Arc<PtyManager>>,
    cmd: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    session_name: Option<String>,
) -> Result<CreateSessionResult, String> {
    // Convert Vec<String> to Vec<&str> for the manager API.
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let name_ref = session_name.as_deref();

    let result = state.create_session(app, &cmd, &args_ref, &cwd, cols, rows, name_ref)?;
    Ok(result)
}

/// Send keyboard input to an existing session.
///
/// `data` is expected to be UTF-8 text (e.g. printable characters, escape
/// sequences).  It is transmitted as raw bytes to the PTY master.
#[tauri::command]
pub fn terminal_write(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.write_to_session(&session_id, data.as_bytes())
}

/// Notify the running program that the terminal window has been resized.
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize_session(&session_id, cols, rows)
}

/// Disconnect the PTY from the child process and remove the session.
#[tauri::command]
pub fn terminal_close(state: State<'_, Arc<PtyManager>>, session_id: String) -> Result<(), String> {
    state.close_session(&session_id)?;
    Ok(())
}

/// Return a list of all known PTY sessions with their running status.
#[tauri::command]
pub fn terminal_list(state: State<'_, Arc<PtyManager>>) -> Vec<SessionInfo> {
    state.list_sessions()
}
