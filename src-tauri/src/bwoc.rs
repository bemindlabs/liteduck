use serde::Serialize;
use std::process::Command;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Detection result for the external `bwoc` orchestration CLI.
///
/// When the binary is not found this is returned with `installed: false`
/// rather than an error — a missing optional integration is not a failure.
#[derive(Debug, Serialize)]
pub struct BwocStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// A single agent row parsed from `bwoc list`.
///
/// Parsing is intentionally lenient: the original line is always preserved in
/// `raw`, while `name` / `role` are filled in only when they can be extracted.
#[derive(Debug, Serialize)]
pub struct BwocAgent {
    pub name: String,
    pub role: Option<String>,
    pub raw: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Extract the version number from the output of `bwoc --version`.
///
/// The CLI prints a single line like `bwoc 2.5.0`; we return the first
/// whitespace-separated token that looks like a version (i.e. the token after
/// the program name). Returns `None` when nothing parseable is found.
fn parse_version(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| !line.trim().is_empty())
        .and_then(|line| {
            // Prefer the token following a leading "bwoc" program name; fall
            // back to the first token that starts with a digit.
            let mut tokens = line.split_whitespace();
            match tokens.next() {
                Some("bwoc") => tokens.next().map(|s| s.to_string()),
                Some(first) if first.chars().next().is_some_and(|c| c.is_ascii_digit()) => {
                    Some(first.to_string())
                }
                _ => line
                    .split_whitespace()
                    .find(|t| t.chars().next().is_some_and(|c| c.is_ascii_digit()))
                    .map(|s| s.to_string()),
            }
        })
}

/// Parse a single row of `bwoc list` output into a [`BwocAgent`].
///
/// Returns `None` for header / separator / blank lines so the caller can skip
/// them. The expected data rows look like:
///
/// ```text
/// ○ agent-sun                      active     claude     —         —       agents/agent-sun
/// ```
///
/// The leading status glyph (`○`/`●`) is stripped; the first remaining token is
/// the agent name and the following token (the STATUS column) is used as the
/// role. Everything is best-effort — the raw line is always retained.
fn parse_agent_row(line: &str) -> Option<BwocAgent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Skip the header row and the box-drawing separator line.
    if trimmed.starts_with("ID") && trimmed.contains("STATUS") {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c == '─' || c == '-' || c.is_whitespace())
    {
        return None;
    }

    // Drop a leading status glyph (e.g. "○" / "●") if present.
    let mut tokens: Vec<&str> = trimmed.split_whitespace().collect();
    if let Some(first) = tokens.first() {
        if first.chars().all(|c| !c.is_alphanumeric()) {
            tokens.remove(0);
        }
    }

    let name = tokens.first()?.to_string();
    if name.is_empty() {
        return None;
    }
    let role = tokens.get(1).map(|s| s.to_string());

    Some(BwocAgent {
        name,
        role,
        raw: trimmed.to_string(),
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_handles_standard_output() {
        assert_eq!(parse_version("bwoc 2.2.0"), Some("2.2.0".to_string()));
    }

    #[test]
    fn parse_version_handles_real_output_with_newline() {
        assert_eq!(parse_version("bwoc 2.5.0\n"), Some("2.5.0".to_string()));
    }

    #[test]
    fn parse_version_handles_bare_version() {
        assert_eq!(parse_version("2.2.0"), Some("2.2.0".to_string()));
    }

    #[test]
    fn parse_version_returns_none_for_empty() {
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("\n  \n"), None);
    }

    #[test]
    fn parse_agent_row_extracts_name_and_role() {
        let line = "○ agent-sun                      active     claude     —         —       agents/agent-sun";
        let agent = parse_agent_row(line).expect("row should parse");
        assert_eq!(agent.name, "agent-sun");
        assert_eq!(agent.role.as_deref(), Some("active"));
        assert_eq!(agent.raw, line.trim());
    }

    #[test]
    fn parse_agent_row_skips_header() {
        let header =
            "ID                               STATUS     BACKEND    UPTIME    INBOX   PATH";
        assert!(parse_agent_row(header).is_none());
    }

    #[test]
    fn parse_agent_row_skips_separator() {
        let sep = "──────────────────────────────── ────────── ────────── ───────── ─────── ────────────────────";
        assert!(parse_agent_row(sep).is_none());
        assert!(parse_agent_row("----------").is_none());
    }

    #[test]
    fn parse_agent_row_skips_blank() {
        assert!(parse_agent_row("").is_none());
        assert!(parse_agent_row("   ").is_none());
    }

    #[test]
    fn parse_agent_row_handles_row_without_glyph() {
        let agent = parse_agent_row("agent-mars  active  claude").expect("row should parse");
        assert_eq!(agent.name, "agent-mars");
        assert_eq!(agent.role.as_deref(), Some("active"));
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Resolve the `bwoc` binary, run `bwoc --version`, and report detection status.
///
/// Returns `BwocStatus { installed: false, .. }` (NOT an error) when the binary
/// cannot be found, so an absent optional integration is treated as a normal,
/// expected state. Only genuine execution failures surface as `Err`.
#[tauri::command]
pub fn bwoc_detect() -> Result<BwocStatus, String> {
    // Resolve the binary via `which bwoc`. A non-zero exit (or a failure to run
    // `which`) means the integration simply isn't installed.
    let which = Command::new("which").arg("bwoc").output();
    let path = match which {
        Ok(out) if out.status.success() => {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if p.is_empty() {
                return Ok(BwocStatus {
                    installed: false,
                    version: None,
                    path: None,
                });
            }
            p
        }
        Ok(_) => {
            return Ok(BwocStatus {
                installed: false,
                version: None,
                path: None,
            });
        }
        Err(e) => return Err(format!("Failed to run 'which bwoc': {e}")),
    };

    // The binary resolved — query its version.
    let output = Command::new(&path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run 'bwoc --version': {e}"))?;

    let version = if output.status.success() {
        parse_version(&String::from_utf8_lossy(&output.stdout))
    } else {
        None
    };

    Ok(BwocStatus {
        installed: true,
        version,
        path: Some(path),
    })
}

/// Run `bwoc list` and parse each agent row leniently.
///
/// Returns `Err("bwoc is not installed")` when the binary cannot be resolved,
/// matching the read-only, opt-in contract (the caller only invokes this once
/// detection has confirmed the integration is present).
#[tauri::command]
pub fn bwoc_list() -> Result<Vec<BwocAgent>, String> {
    // Confirm the binary exists first so we can return a clear, specific error.
    let which = Command::new("which")
        .arg("bwoc")
        .output()
        .map_err(|e| format!("Failed to run 'which bwoc': {e}"))?;
    if !which.status.success() {
        return Err("bwoc is not installed".to_string());
    }

    let output = Command::new("bwoc")
        .arg("list")
        .output()
        .map_err(|e| format!("Failed to run 'bwoc list': {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("'bwoc list' failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let agents = stdout.lines().filter_map(parse_agent_row).collect();
    Ok(agents)
}
