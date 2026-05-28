use std::collections::HashMap;
use std::io::{Read, Write};
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
pub struct CreateSessionResult {
    /// UUID of the PTY session.
    pub session_id: String,
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
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/// Maximum number of concurrent PTY sessions.
const MAX_SESSIONS: usize = 20;

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
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
        }
    }

    /// Spawn a new PTY session.  Returns the session UUID.
    ///
    /// Always spawns the user's default login shell directly (no session
    /// multiplexer wrapping).  Pass an empty `cmd` to use the shell alone, or
    /// a non-empty `cmd` + `args` to launch a specific program.  The optional
    /// `session_name` is currently unused and kept for API compatibility.
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
        _session_name: Option<&str>,
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

        // Plain interactive login shell. If a startup command was supplied we
        // write it to the shell's stdin after spawn so the user can see it run
        // and the shell remains alive afterwards.
        let shell = default_shell();
        let shell_cmd = shell;
        let shell_args: Vec<String> = vec!["-l".into()];
        let startup_cmd: Option<String> = if !cmd.is_empty() {
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

        // If a startup command was requested, write it to the shell.
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

            // Notify the frontend that this session's PTY has closed.
            let _ = app.emit("pty-closed", sid_for_thread);
        });

        let session = PtySession {
            _master: pair.master,
            writer,
            child,
            _reader_thread: reader_thread,
        };

        self.sessions.lock().insert(session_id.clone(), session);
        Ok(CreateSessionResult { session_id })
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
    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let mut session = sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;

        // Kill the child; ignore errors (it may have already exited).
        let _ = session.child.kill();
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

/// Return the user's preferred login shell, falling back to `/bin/sh`.
fn default_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    "/bin/sh".to_owned()
}
