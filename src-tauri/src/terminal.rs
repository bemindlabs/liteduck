use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::pty::{CreateSessionResult, PtyManager, SessionInfo, TmuxSessionInfo};

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Spawn a new PTY session and return its UUID.
///
/// Pass an empty `cmd` string to use the user's default login shell (or tmux
/// wrapping the default shell when tmux is available).
/// `args` may be empty.  `cwd` may be empty to inherit the process working
/// directory.
///
/// `session_name` is an optional hint for the tmux session name.  When
/// provided the backend will sanitise it and use it as the tmux session name.
/// If a session with that name already exists the PTY will attach to it
/// instead of creating a new one (transparent reattachment).  When omitted
/// or empty a counter-based `aidlc-{n}` name is used as before.
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
///
/// When the terminal was tmux-backed, closing the tab only detaches from the
/// tmux session — the tmux session itself keeps running and can be
/// re-attached later via `terminal_attach`.
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

/// Return all existing tmux sessions visible from the current user environment.
///
/// Returns an empty array when tmux is not installed or no sessions exist.
/// The frontend uses this on mount to auto-populate tabs for persistent
/// sessions.
#[tauri::command]
pub fn terminal_list_tmux(state: State<'_, Arc<PtyManager>>) -> Vec<TmuxSessionInfo> {
    state.list_tmux_sessions()
}

/// Permanently destroy a tmux session by name.
///
/// Runs `tmux kill-session -t {tmux_session}`, which terminates all processes
/// running inside that session.  This is irreversible — use `terminal_close`
/// instead when you only want to detach the PTY while keeping the session
/// alive for later re-attachment.
#[tauri::command]
pub fn terminal_kill_tmux(
    state: State<'_, Arc<PtyManager>>,
    tmux_session: String,
) -> Result<(), String> {
    state.kill_tmux_session(&tmux_session)
}

/// Rename a tmux session.
///
/// Runs `tmux rename-session -t {old_name} {new_name}`.  The frontend should
/// update its tab label and `tmuxSession` field after a successful call.
#[tauri::command]
pub fn terminal_rename_tmux(
    state: State<'_, Arc<PtyManager>>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    state.rename_tmux_session(&old_name, &new_name)?;
    Ok(())
}

/// Split the tmux window inside a running PTY session.
///
/// Sends the tmux prefix + split key sequence directly to the PTY so that the
/// tmux client running in that session splits its current pane.
///
/// * `horizontal: true`  → split vertically   (side-by-side, `Ctrl-B %`)
/// * `horizontal: false` → split horizontally (top/bottom,   `Ctrl-B "`)
///
/// Returns an error when the session is not found, the PTY write fails, or
/// the tab is not backed by a tmux session (though the latter cannot be
/// enforced in Rust — the frontend gate is the right place for that check).
#[tauri::command]
pub fn terminal_tmux_split(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
    horizontal: bool,
) -> Result<(), String> {
    state.tmux_split_pane(&session_id, horizontal)
}

/// Create a new window (tab) inside an existing tmux session.
/// Sends Ctrl-B c (tmux new-window) to the PTY.
#[tauri::command]
pub fn terminal_tmux_new_window(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
) -> Result<(), String> {
    state.tmux_new_window(&session_id)
}

/// Switch to the next tmux window. Sends Ctrl-B n.
#[tauri::command]
pub fn terminal_tmux_next_window(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
) -> Result<(), String> {
    state.tmux_next_window(&session_id)
}

/// Switch to the previous tmux window. Sends Ctrl-B p.
#[tauri::command]
pub fn terminal_tmux_prev_window(
    state: State<'_, Arc<PtyManager>>,
    session_id: String,
) -> Result<(), String> {
    state.tmux_prev_window(&session_id)
}

/// Attach to an existing tmux session and return a new PTY session UUID.
///
/// This spawns `tmux attach-session -t {tmux_session}` in a fresh PTY so
/// xterm.js can render the restored session output.
///
/// Errors when tmux is not installed or the named session does not exist.
#[tauri::command]
pub fn terminal_attach(
    app: AppHandle,
    state: State<'_, Arc<PtyManager>>,
    tmux_session: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let session_id = state.attach_session(app, &tmux_session, cols, rows)?;
    Ok(session_id)
}
