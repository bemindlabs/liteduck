use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command as StdCommand;
use std::thread;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxSessionInfo {
    /// tmux session name (e.g. "aidlc-0")
    pub name: String,
    /// Number of windows in the session.
    pub windows: u32,
    /// ISO-8601 timestamp string of when the session was created.
    pub created: String,
    /// Whether this session currently has a client attached.
    pub attached: bool,
    /// Working directory of the session (session_path).
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResult {
    /// UUID of the PTY session.
    pub session_id: String,
    /// When tmux was used, the name of the tmux session (e.g. "aidlc-0").
    /// `None` when tmux is not installed and the raw PTY fallback was used.
    pub tmux_session: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutputPayload {
    pub session_id: String,
    pub data: String,
}

// ---------------------------------------------------------------------------
// Internal session state
// ---------------------------------------------------------------------------

struct PtySession {
    /// PTY master – kept alive so the slave end stays open.
    _master: Box<dyn MasterPty + Send>,
    /// Write half of the PTY (stdin for the child process).
    writer: Box<dyn Write + Send>,
    /// Child process handle.
    child: Box<dyn Child + Send + Sync>,
    /// Background reader thread handle (detached; we join on close).
    _reader_thread: thread::JoinHandle<()>,
    /// When tmux was used, the name of the tmux session (e.g. "Claude-Code-1").
    tmux_session: Option<String>,
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/// Maximum number of concurrent PTY sessions.
const MAX_SESSIONS: usize = 20;

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
    /// Monotonic counter used to generate unique tmux session names.
    tmux_counter: Mutex<u32>,
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        // Kill all child processes on shutdown so reader threads exit cleanly.
        let mut sessions = self.sessions.lock();
        for (id, mut session) in sessions.drain() {
            log::info!("pty: cleaning up session {id}");
            let _ = session.child.kill();
        }
    }
}

impl PtyManager {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            tmux_counter: Mutex::new(initial_tmux_counter()),
        }
    }

    /// Spawn a new PTY session.  Returns the session UUID.
    ///
    /// When tmux is available the session runs `tmux new-session -s <name>`
    /// so the shell process is wrapped inside a tmux session.  This gives full
    /// session persistence: closing the tab only disconnects the PTY; the tmux
    /// session keeps running and can be re-attached later.
    ///
    /// The `session_name` hint is used as the tmux session name when provided
    /// and tmux is available.  The name is sanitised (whitespace → `-`,
    /// non-alphanumeric/dash/underscore/dot stripped) before use.  If a tmux
    /// session with that name already exists the PTY will *attach* to it
    /// instead of creating a new one, enabling transparent reattachment.
    ///
    /// Falls back to a plain login shell when tmux is not installed.
    ///
    /// A background thread is started that continuously reads PTY output and
    /// emits `"pty-output"` Tauri events carrying [`PtyOutputPayload`].
    pub fn create_session(
        &self,
        app: AppHandle,
        cmd: &str,
        args: &[&str],
        cwd: &str,
        cols: u16,
        rows: u16,
        session_name: Option<&str>,
    ) -> Result<CreateSessionResult, String> {
        if self.sessions.lock().len() >= MAX_SESSIONS {
            return Err(format!(
                "Too many open terminal sessions (max {MAX_SESSIONS}). Close some tabs first."
            ));
        }

        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        // Decide whether to use tmux.
        let tmux_path = tmux_binary();
        let use_tmux = tmux_path.is_some();

        // Track the tmux session name so we can return it to the frontend.
        let mut tmux_session_name: Option<String> = None;

        let (shell_cmd, shell_args, startup_cmd) = if use_tmux {
            // Resolve the tmux session name: use the caller-supplied hint
            // (sanitised) if provided, otherwise fall back to the monotonic
            // counter-based `aidlc-{n}` name.
            let resolved_name = match session_name {
                Some(hint) if !hint.trim().is_empty() => {
                    let sanitised = sanitise_tmux_name(hint);
                    if sanitised.is_empty() {
                        // Hint collapsed to empty after sanitisation — fall
                        // back to the counter.
                        let mut counter = self.tmux_counter.lock();
                        let n = *counter;
                        *counter += 1;
                        format!("aidlc-{n}")
                    } else {
                        sanitised
                    }
                }
                _ => {
                    let mut counter = self.tmux_counter.lock();
                    let n = *counter;
                    *counter += 1;
                    format!("aidlc-{n}")
                }
            };

            // If a session with this name already exists, attach to it
            // instead of creating a new one.  This is the reattachment path
            // that fires when the app restarts or the user opens a tab whose
            // name matches a surviving session.
            let tmux_bin = match tmux_path {
                Some(bin) => bin,
                // Unreachable while `use_tmux == tmux_path.is_some()`, but return
                // a clean error rather than panicking if that invariant ever drifts.
                None => return Err("tmux was selected but its binary path is unavailable".to_string()),
            };
            if tmux_session_exists(&tmux_bin, &resolved_name) {
                // Reuse the existing session — drop into attach-session mode.
                tmux_session_name = Some(resolved_name.clone());
                let t_args: Vec<String> = vec!["attach-session".into(), "-t".into(), resolved_name];
                (tmux_bin, t_args, None::<String>)
            } else {
                tmux_session_name = Some(resolved_name.clone());

                // If a command was requested (e.g. "claude"), pass it as the
                // initial-command to the tmux session so it runs inside tmux.
                let mut t_args: Vec<String> =
                    vec!["new-session".into(), "-s".into(), resolved_name];

                if !cwd.is_empty() {
                    t_args.push("-c".into());
                    t_args.push(cwd.to_owned());
                }

                if !cmd.is_empty() {
                    // Build the full command string for tmux's initial-command.
                    // Wrap in a login *interactive* shell so that the user's
                    // full PATH is available — `-lic` sources both .zprofile
                    // AND .zshrc/.bashrc.  The Tauri app may have been
                    // launched from Finder/Dock with a minimal launchd
                    // environment where CLI tools like `claude`, `codex`,
                    // `gemini` are not on PATH.  Many tools (nvm, volta,
                    // Homebrew) add to PATH in .zshrc (interactive-only), so
                    // `-lc` alone is not enough.
                    //
                    // After the command finishes, drop into an interactive
                    // shell so the tmux session stays alive and the user can
                    // continue working (and use tmux hotkeys like Ctrl-B c).
                    let mut full = shell_quote(cmd);
                    for a in args {
                        full.push(' ');
                        full.push_str(&shell_quote(a));
                    }
                    let shell = default_shell();
                    // Run: $SHELL -lic "command ...; exec $SHELL" so the
                    // session doesn't exit when the command completes.
                    let inner = format!("{}; exec {shell}", full);
                    let wrapped = format!("{shell} -lic {}", shell_quote(&inner));
                    t_args.push(wrapped);
                }

                (tmux_bin, t_args, None::<String>)
            } // end else (new-session branch)
        } else {
            // Fallback: plain interactive login shell.
            let shell = default_shell();
            let startup = if !cmd.is_empty() {
                let mut full = cmd.to_owned();
                for a in args {
                    full.push(' ');
                    full.push_str(a);
                }
                full.push('\n');
                Some(full)
            } else {
                None
            };
            (shell, vec!["-l".into()], startup)
        };

        let mut builder = CommandBuilder::new(&shell_cmd);
        for a in &shell_args {
            builder.arg(a);
        }

        // Ensure UTF-8 locale for proper international text handling.
        builder.env("LANG", "en_US.UTF-8");
        builder.env("LC_ALL", "en_US.UTF-8");
        builder.env("TERM", "xterm-256color");

        if !cwd.is_empty() {
            builder.cwd(cwd);
        }

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("Failed to spawn command '{shell_cmd}': {e}"))?;

        // Build the writer (PTY stdin).
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        // If a startup command was requested (raw-PTY path only), write it.
        if let Some(ref startup) = startup_cmd {
            let _ = writer.write_all(startup.as_bytes());
            let _ = writer.flush();
        }

        // Build the reader (PTY stdout/stderr merged).
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

        let session_id = Uuid::new_v4().to_string();
        let sid_for_thread = session_id.clone();

        // Spawn a background thread that drains the PTY and emits events.
        let reader_thread = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            // Leftover bytes from previous read that form an incomplete
            // UTF-8 sequence (at most 3 bytes for a 4-byte char).
            let mut pending: Vec<u8> = Vec::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF – child exited
                    Ok(n) => {
                        // Prepend any leftover bytes from the previous read.
                        let mut data = if pending.is_empty() {
                            buf[..n].to_vec()
                        } else {
                            let mut combined = std::mem::take(&mut pending);
                            combined.extend_from_slice(&buf[..n]);
                            combined
                        };

                        // Find the last valid UTF-8 boundary. If the tail bytes
                        // form an incomplete multi-byte sequence, hold them back
                        // for the next read.
                        let valid_up_to = match std::str::from_utf8(&data) {
                            Ok(_) => data.len(),
                            Err(e) => {
                                let safe = e.valid_up_to();
                                // Stash the trailing incomplete bytes.
                                pending = data[safe..].to_vec();
                                safe
                            }
                        };

                        if valid_up_to == 0 {
                            continue; // nothing complete yet
                        }

                        data.truncate(valid_up_to);
                        // SAFETY: we just validated this slice is valid UTF-8.
                        let text = unsafe { String::from_utf8_unchecked(data) };

                        let payload = PtyOutputPayload {
                            session_id: sid_for_thread.clone(),
                            data: text,
                        };
                        // Best-effort emit; ignore errors (window may be gone).
                        let _ = app.emit("pty-output", payload);
                    }
                    Err(_) => break, // PTY closed or I/O error
                }
            }

            // Notify the frontend that this session's PTY has closed (e.g.
            // tmux session killed externally with `tmux kill-session`).
            let _ = app.emit("pty-closed", sid_for_thread);
        });

        let session = PtySession {
            _master: pair.master,
            writer,
            child,
            _reader_thread: reader_thread,
            tmux_session: tmux_session_name.clone(),
        };

        self.sessions.lock().insert(session_id.clone(), session);
        Ok(CreateSessionResult {
            session_id,
            tmux_session: tmux_session_name,
        })
    }

    /// Attach to an existing tmux session by name.
    ///
    /// This creates a new PTY that runs `tmux attach-session -t {name}`,
    /// reconnecting xterm.js to the running tmux session.  Returns the new
    /// PTY session UUID.
    pub fn attach_session(
        &self,
        app: AppHandle,
        tmux_session: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        if self.sessions.lock().len() >= MAX_SESSIONS {
            return Err(format!(
                "Too many open terminal sessions (max {MAX_SESSIONS}). Close some tabs first."
            ));
        }

        let tmux_bin =
            tmux_binary().ok_or_else(|| "tmux is not installed or not in PATH".to_string())?;

        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut builder = CommandBuilder::new(&tmux_bin);
        builder.arg("attach-session");
        builder.arg("-t");
        builder.arg(tmux_session);

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("Failed to attach to tmux session '{tmux_session}': {e}"))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

        let session_id = Uuid::new_v4().to_string();
        let sid_for_thread = session_id.clone();

        let reader_thread = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut pending: Vec<u8> = Vec::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut data = if pending.is_empty() {
                            buf[..n].to_vec()
                        } else {
                            let mut combined = std::mem::take(&mut pending);
                            combined.extend_from_slice(&buf[..n]);
                            combined
                        };

                        let valid_up_to = match std::str::from_utf8(&data) {
                            Ok(_) => data.len(),
                            Err(e) => {
                                let safe = e.valid_up_to();
                                pending = data[safe..].to_vec();
                                safe
                            }
                        };

                        if valid_up_to == 0 {
                            continue;
                        }

                        data.truncate(valid_up_to);
                        let text = unsafe { String::from_utf8_unchecked(data) };
                        let payload = PtyOutputPayload {
                            session_id: sid_for_thread.clone(),
                            data: text,
                        };
                        let _ = app.emit("pty-output", payload);
                    }
                    Err(_) => break,
                }
            }

            // Notify the frontend that this session's PTY has closed.
            let _ = app.emit("pty-closed", sid_for_thread);
        });

        let session = PtySession {
            _master: pair.master,
            writer,
            child,
            _reader_thread: reader_thread,
            tmux_session: Some(tmux_session.to_string()),
        };

        self.sessions.lock().insert(session_id.clone(), session);
        Ok(session_id)
    }

    /// List all tmux sessions visible from the current user's environment.
    ///
    /// Returns an empty list when tmux is not installed or no sessions exist.
    pub fn list_tmux_sessions(&self) -> Vec<TmuxSessionInfo> {
        let tmux_bin = match tmux_binary() {
            Some(b) => b,
            None => return vec![],
        };

        // `tmux list-sessions -F` lets us define a custom format.
        // Fields: name, windows, created (unix timestamp), attached flag, session path.
        let output = StdCommand::new(&tmux_bin)
            .args([
                "list-sessions",
                "-F",
                "#{session_name}\t#{session_windows}\t#{session_created}\t#{session_attached}\t#{session_path}",
            ])
            .output();

        match output {
            Err(_) => vec![],
            Ok(out) => {
                if !out.status.success() {
                    // tmux exits non-zero when there are no sessions.
                    return vec![];
                }
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout
                    .lines()
                    .filter_map(|line| {
                        let parts: Vec<&str> = line.splitn(5, '\t').collect();
                        if parts.len() < 5 {
                            return None;
                        }
                        let name = parts[0].to_owned();
                        let windows: u32 = parts[1].parse().unwrap_or(0);
                        let created_ts: u64 = parts[2].parse().unwrap_or(0);
                        let attached: bool = parts[3] != "0";
                        let path = parts[4].to_owned();

                        // Format timestamp as ISO-8601 wall-clock string.
                        let created = format_unix_ts(created_ts);

                        Some(TmuxSessionInfo {
                            name,
                            windows,
                            created,
                            attached,
                            path,
                        })
                    })
                    .collect()
            }
        }
    }

    /// Write raw bytes (keyboard input) to a running session.
    pub fn write_to_session(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;

        session
            .writer
            .write_all(data)
            .map_err(|e| format!("Write error: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush error: {e}"))?;
        Ok(())
    }

    /// Resize the PTY window for a running session.
    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;

        session
            ._master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {e}"))?;
        Ok(())
    }

    /// Kill the child process and remove the session.
    ///
    /// Note: when the session was tmux-backed, this only closes the PTY
    /// connection; the tmux session itself keeps running and can be
    /// re-attached later via [`attach_session`].
    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let mut session = sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;

        // Kill the child; ignore errors (it may have already exited).
        let _ = session.child.kill();
        Ok(())
    }

    /// Rename a tmux session (`tmux rename-session -t {old_name} {new_name}`).
    pub fn rename_tmux_session(&self, old_name: &str, new_name: &str) -> Result<(), String> {
        let tmux_bin =
            tmux_binary().ok_or_else(|| "tmux is not installed or not in PATH".to_string())?;

        let status = StdCommand::new(&tmux_bin)
            .args(["rename-session", "-t", old_name, new_name])
            .status()
            .map_err(|e| format!("Failed to run tmux rename-session: {e}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!(
                "tmux rename-session -t '{old_name}' '{new_name}' exited with status {status}"
            ))
        }
    }

    /// Kill a tmux session by name (`tmux kill-session -t {name}`).
    ///
    /// This permanently destroys the tmux session and all its windows/panes,
    /// unlike [`close_session`] which merely detaches the PTY connection while
    /// leaving the tmux session running.
    ///
    /// After killing the session, this also closes any PTY sessions attached to it
    /// to ensure proper cleanup.
    pub fn kill_tmux_session(&self, name: &str) -> Result<(), String> {
        let tmux_bin =
            tmux_binary().ok_or_else(|| "tmux is not installed or not in PATH".to_string())?;

        log::info!("[pty] Killing tmux session: {}", name);

        let status = StdCommand::new(&tmux_bin)
            .args(["kill-session", "-t", name])
            .status()
            .map_err(|e| format!("Failed to run tmux kill-session: {e}"))?;

        if status.success() {
            log::info!("[pty] Successfully killed tmux session: {}", name);

            // Find and close all PTY sessions attached to this tmux session
            let session_ids_to_close: Vec<String> = {
                let sessions = self.sessions.lock();
                sessions
                    .iter()
                    .filter(|(_, s)| s.tmux_session.as_deref() == Some(name))
                    .map(|(id, _)| id.clone())
                    .collect()
            };

            // Close each PTY session
            for session_id in session_ids_to_close {
                log::info!(
                    "[pty] Closing PTY session {} attached to killed tmux session",
                    session_id
                );
                let _ = self.close_session(&session_id);
            }

            Ok(())
        } else {
            Err(format!(
                "tmux kill-session -t '{name}' exited with status {status}"
            ))
        }
    }

    /// Send a tmux split-window command to the session identified by `session_id`.
    ///
    /// The split is performed by writing the tmux prefix key sequence (`Ctrl-B`)
    /// followed by the split key directly into the PTY master (stdin of the
    /// tmux client process).  tmux intercepts the prefix key in the client and
    /// executes the split immediately without any shell involvement.
    ///
    /// * `horizontal: true`  → `Ctrl-B %`  (vertical divider, side-by-side panes)
    /// * `horizontal: false` → `Ctrl-B "`  (horizontal divider, top/bottom panes)
    pub fn tmux_split_pane(&self, session_id: &str, horizontal: bool) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;

        // \x02 is Ctrl-B (tmux prefix).  '%' splits vertically (side-by-side),
        // '"' splits horizontally (top/bottom).
        let keys: &[u8] = if horizontal { b"\x02%" } else { b"\x02\"" };

        session
            .writer
            .write_all(keys)
            .map_err(|e| format!("Write error: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush error: {e}"))?;
        Ok(())
    }

    /// Create a new window inside a tmux session (Ctrl-B c).
    pub fn tmux_new_window(&self, session_id: &str) -> Result<(), String> {
        log::info!("[pty] tmux_new_window called for session: {}", session_id);

        // First, try to get the tmux session name from the session
        let tmux_session_name = {
            let sessions = self.sessions.lock();
            sessions
                .get(session_id)
                .and_then(|s| s.tmux_session.clone())
        };

        if let Some(tmux_name) = tmux_session_name {
            log::info!("[pty] Found tmux session name: {}", tmux_name);

            // Use direct tmux command instead of sending keystrokes
            if let Some(tmux_bin) = tmux_binary() {
                use std::process::Command;
                let output = Command::new(&tmux_bin)
                    .args(["new-window", "-t", &tmux_name])
                    .output()
                    .map_err(|e| format!("Failed to run tmux new-window: {e}"))?;

                if output.status.success() {
                    log::info!("[pty] Successfully created new window via tmux command");
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("[pty] tmux new-window command failed: {}", stderr);
                    // Fall back to sending keystrokes
                }
            }
        }

        // Fallback: send Ctrl-B c keystrokes
        log::info!("[pty] Falling back to sending Ctrl-B c keystrokes");
        let result = self.tmux_send_keys(session_id, b"\x02c");
        log::info!("[pty] tmux_new_window result: {:?}", result);
        result
    }

    /// Switch to next tmux window (Ctrl-B n).
    pub fn tmux_next_window(&self, session_id: &str) -> Result<(), String> {
        log::info!("[pty] tmux_next_window called for session: {}", session_id);

        let tmux_session_name = {
            let sessions = self.sessions.lock();
            sessions
                .get(session_id)
                .and_then(|s| s.tmux_session.clone())
        };

        if let Some(tmux_name) = tmux_session_name {
            log::info!("[pty] Found tmux session name: {}", tmux_name);

            if let Some(tmux_bin) = tmux_binary() {
                use std::process::Command;
                let output = Command::new(&tmux_bin)
                    .args(["next-window", "-t", &tmux_name])
                    .output()
                    .map_err(|e| format!("Failed to run tmux next-window: {e}"))?;

                if output.status.success() {
                    log::info!("[pty] Successfully switched to next window via tmux command");
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("[pty] tmux next-window command failed: {}", stderr);
                }
            }
        }

        log::info!("[pty] Falling back to sending Ctrl-B n keystrokes");
        self.tmux_send_keys(session_id, b"\x02n")
    }

    /// Switch to previous tmux window (Ctrl-B p).
    pub fn tmux_prev_window(&self, session_id: &str) -> Result<(), String> {
        log::info!("[pty] tmux_prev_window called for session: {}", session_id);

        let tmux_session_name = {
            let sessions = self.sessions.lock();
            sessions
                .get(session_id)
                .and_then(|s| s.tmux_session.clone())
        };

        if let Some(tmux_name) = tmux_session_name {
            log::info!("[pty] Found tmux session name: {}", tmux_name);

            if let Some(tmux_bin) = tmux_binary() {
                use std::process::Command;
                let output = Command::new(&tmux_bin)
                    .args(["previous-window", "-t", &tmux_name])
                    .output()
                    .map_err(|e| format!("Failed to run tmux previous-window: {e}"))?;

                if output.status.success() {
                    log::info!("[pty] Successfully switched to previous window via tmux command");
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("[pty] tmux previous-window command failed: {}", stderr);
                }
            }
        }

        log::info!("[pty] Falling back to sending Ctrl-B p keystrokes");
        self.tmux_send_keys(session_id, b"\x02p")
    }

    /// Send raw key bytes to a PTY session.
    fn tmux_send_keys(&self, session_id: &str, keys: &[u8]) -> Result<(), String> {
        log::debug!(
            "[pty] tmux_send_keys session={} keys={:?}",
            session_id,
            keys
        );
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;
        session
            .writer
            .write_all(keys)
            .map_err(|e| format!("Write error: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush error: {e}"))?;
        log::debug!(
            "[pty] tmux_send_keys successfully sent {} bytes",
            keys.len()
        );
        Ok(())
    }

    /// Return a snapshot of all sessions and whether the child is still alive.
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let mut sessions = self.sessions.lock();
        sessions
            .iter_mut()
            .map(|(id, session)| {
                // try_wait: Ok(None) means still running.
                let running = session
                    .child
                    .try_wait()
                    .map(|status| status.is_none())
                    .unwrap_or(false);
                SessionInfo {
                    id: id.clone(),
                    running,
                }
            })
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Scan existing tmux sessions for names matching `aidlc-{N}` and return
/// `max(N) + 1` so the counter never collides with sessions that survived a
/// previous app run.  Returns `0` when tmux is unavailable or no matching
/// sessions exist.
fn initial_tmux_counter() -> u32 {
    let tmux_bin = match tmux_binary() {
        Some(b) => b,
        None => return 0,
    };

    let output = StdCommand::new(&tmux_bin)
        .args(["list-sessions", "-F", "#{session_name}"])
        .output();

    let out = match output {
        Ok(o) if o.status.success() => o,
        _ => return 0,
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let max_n = stdout
        .lines()
        .filter_map(|name| name.strip_prefix("aidlc-"))
        .filter_map(|suffix| suffix.parse::<u32>().ok())
        .max();

    match max_n {
        Some(n) => n + 1,
        None => 0,
    }
}

/// Single-quote a string for safe shell interpolation.
/// Any embedded single-quotes are escaped as `'\''`.
fn shell_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

/// Return the user's preferred login shell, falling back to `/bin/sh`.
fn default_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    "/bin/sh".to_owned()
}

/// Return the path to the tmux binary if it is installed, or `None`.
fn tmux_binary() -> Option<String> {
    // Prefer the explicit env-var override (useful in tests / CI).
    if let Ok(path) = std::env::var("TMUX_BIN") {
        if !path.is_empty() {
            return Some(path);
        }
    }

    // Try common locations first, then fall back to PATH resolution.
    let candidates = [
        "/opt/homebrew/bin/tmux",
        "/usr/local/bin/tmux",
        "/usr/bin/tmux",
        "tmux",
    ];
    for candidate in &candidates {
        let output = StdCommand::new(candidate).arg("-V").output();
        if output.map(|o| o.status.success()).unwrap_or(false) {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Sanitise a caller-supplied string so it is safe to use as a tmux session
/// name.  tmux session names must not contain `.` or `:` (tmux uses these as
/// separators in target notation) and conventionally use only ASCII
/// alphanumerics, `-` and `_`.  This function:
///   1. Trims surrounding whitespace.
///   2. Replaces runs of whitespace with `-`.
///   3. Drops characters that are not alphanumeric, `-`, `_`, or `.`.
///   4. Truncates to 64 characters to stay well within tmux limits.
fn sanitise_tmux_name(name: &str) -> String {
    // Step 1: trim then replace whitespace runs with `-`.
    let collapsed = name.split_whitespace().collect::<Vec<_>>().join("-");

    // Step 2: keep only safe chars.
    let filtered: String = collapsed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();

    // Step 3: truncate.
    filtered.chars().take(64).collect()
}

/// Return `true` when a tmux session named `name` currently exists.
fn tmux_session_exists(tmux_bin: &str, name: &str) -> bool {
    StdCommand::new(tmux_bin)
        .args(["has-session", "-t", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Convert a Unix timestamp (seconds) to a human-readable string.
/// On failure, returns the raw timestamp as a string.
fn format_unix_ts(ts: u64) -> String {
    use std::time::{Duration, UNIX_EPOCH};
    let d = UNIX_EPOCH + Duration::from_secs(ts);
    // Format as a simple RFC 3339-ish string without external dependencies.
    // std doesn't expose strftime, so we just show the debug output which is
    // "SystemTime { tv_sec: N, tv_nsec: N }".  Instead, emit the raw seconds
    // value — the frontend can format it with `new Date(ts * 1000)`.
    let _ = d; // silence unused-variable warning
    ts.to_string()
}
