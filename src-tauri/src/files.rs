use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
    pub modified: String,
    pub extension: Option<String>,
}

// ── Security ──────────────────────────────────────────────────────────────────

/// Validate that `raw` is a safe, non-traversal path.
///
/// The function canonicalizes the path so that any `..` or `.` segments and
/// symlinks are resolved by the OS.  It then walks every component of the
/// resolved path to confirm none of them is a `ParentDir` (`..`) component.
/// Because canonicalization requires the path to exist on disk, we fall back
/// to a lexical check (stripping `.` / `..` through `Path::components`) when
/// the path does not yet exist (e.g. a target file about to be written).
///
/// If `workspace_root` is supplied the resolved path must start with it,
/// preventing access to anything outside the open workspace.
///
/// Returns the validated, absolute `PathBuf` on success or an error string
/// describing the violation.
fn validate_path(raw: &str, workspace_root: Option<&Path>) -> Result<PathBuf, String> {
    let input = Path::new(raw);

    // Attempt OS-level canonicalization (resolves symlinks + `..`).
    let canonical = if input.exists() {
        input
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path '{raw}': {e}"))?
    } else {
        // Path doesn't exist yet — build an absolute path lexically so we can
        // still reject traversal components before the file is created.
        let abs = if input.is_absolute() {
            input.to_path_buf()
        } else {
            std::env::current_dir()
                .map_err(|e| format!("Failed to determine working directory: {e}"))?
                .join(input)
        };
        // Normalise lexically: resolve `.` and `..` without hitting the FS.
        let mut normalised = PathBuf::new();
        for component in abs.components() {
            match component {
                Component::ParentDir => {
                    // Pop the last segment; if there is none we are already at
                    // the root — just ignore (mirrors what `canonicalize` does).
                    normalised.pop();
                }
                Component::CurDir => {} // skip `.`
                other => normalised.push(other),
            }
        }
        normalised
    };

    // Belt-and-suspenders: walk the resolved path and reject any remaining
    // `..` component (should be impossible after canonicalization / lexical
    // normalisation above, but we defend in depth).
    for component in canonical.components() {
        if component == Component::ParentDir {
            return Err(format!(
                "Path traversal detected — '{}' contains '..' after resolution",
                canonical.display()
            ));
        }
    }

    // Optional workspace-root confinement check.
    if let Some(root) = workspace_root {
        // Canonicalize workspace root too so the prefix check compares like-for-like.
        let root = if root.exists() {
            root.canonicalize()
                .map_err(|e| format!("Failed to canonicalize workspace root: {e}"))?
        } else {
            root.to_path_buf()
        };
        if !canonical.starts_with(&root) {
            return Err(format!(
                "Access denied — '{}' is outside the workspace root '{}'",
                canonical.display(),
                root.display()
            ));
        }
    }

    Ok(canonical)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── validate_path ──────────────────────────────────────────────────────────

    /// An absolute path without any traversal components is accepted.
    #[test]
    fn validate_path_accepts_normal_absolute_path() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("file.txt");
        fs::write(&file, "content").unwrap();

        let result = validate_path(file.to_str().unwrap(), None);
        assert!(result.is_ok(), "normal absolute path should be accepted");
    }

    /// A path using `../` traversal that resolves outside the workspace is
    /// accepted by validate_path when there is no workspace_root — but the
    /// resolved canonical form must not contain any `..` component.  We verify
    /// that the function does not panic and returns a valid, clean path.
    #[test]
    fn validate_path_resolves_traversal_to_clean_path() {
        let dir = tempfile::tempdir().expect("tempdir");
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let file = dir.path().join("target.txt");
        fs::write(&file, "data").unwrap();

        // Build "sub/../target.txt" — canonicalize should resolve this cleanly.
        let traversal = format!("{}/sub/../target.txt", dir.path().display());
        let result = validate_path(&traversal, None);
        assert!(
            result.is_ok(),
            "resolvable traversal should not be rejected"
        );

        let resolved = result.unwrap();
        // The resolved path must not retain any `..` component.
        for component in resolved.components() {
            assert_ne!(
                component,
                std::path::Component::ParentDir,
                "resolved path must not contain '..' components"
            );
        }
    }

    /// When a workspace root is provided, a path that escapes it must be rejected.
    #[test]
    fn validate_path_rejects_escape_from_workspace_root() {
        let root = tempfile::tempdir().expect("workspace root");
        let other = tempfile::tempdir().expect("other dir");
        // Create a real file outside the workspace.
        let outside_file = other.path().join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();

        let result = validate_path(outside_file.to_str().unwrap(), Some(root.path()));
        assert!(
            result.is_err(),
            "path outside workspace root must be rejected"
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("outside the workspace root") || err.contains("Access denied"),
            "error message should indicate workspace violation: {err}"
        );
    }

    /// A path confined within the workspace root is accepted.
    ///
    /// On macOS, `tempfile` directories live under `/var/folders/…` which is a
    /// symlink to `/private/var/folders/…`.  `validate_path` calls
    /// `canonicalize()` on the *file* path, resolving the symlink to
    /// `/private/…`.  The workspace root must therefore also be canonicalized
    /// before being passed so both sides of the `starts_with` check use the
    /// same real path.
    #[test]
    fn validate_path_accepts_path_within_workspace_root() {
        let root = tempfile::tempdir().expect("workspace root");
        let file = root.path().join("notes.md");
        fs::write(&file, "notes").unwrap();

        // Canonicalize the root to match whatever canonicalize() returns for
        // the file inside it (important on macOS where /var → /private/var).
        let canonical_root = root.path().canonicalize().expect("canonicalize root");

        let result = validate_path(file.to_str().unwrap(), Some(&canonical_root));
        assert!(
            result.is_ok(),
            "path inside workspace root should be accepted"
        );
    }

    /// A non-existent path (future file to be written) is handled without
    /// error — the function falls back to a lexical traversal check.
    #[test]
    fn validate_path_handles_nonexistent_path_without_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        let future_file = dir.path().join("new_file.txt");
        // The file does not exist yet.
        assert!(!future_file.exists());

        let result = validate_path(future_file.to_str().unwrap(), None);
        assert!(
            result.is_ok(),
            "non-existent path should be handled gracefully: {:?}",
            result
        );
    }

    // ── epoch_to_iso ───────────────────────────────────────────────────────────

    /// Unix epoch 0 must map to the well-known 1970-01-01T00:00:00Z string.
    #[test]
    fn epoch_to_iso_epoch_zero() {
        assert_eq!(epoch_to_iso(0), "1970-01-01T00:00:00Z");
    }

    /// A well-known epoch value: 2024-03-15 11:54:56 UTC = 1710503696
    #[test]
    fn epoch_to_iso_known_date() {
        // Verified with Python:
        //   datetime.datetime.utcfromtimestamp(1710503696) == datetime(2024, 3, 15, 11, 54, 56)
        assert_eq!(epoch_to_iso(1_710_503_696), "2024-03-15T11:54:56Z");
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn metadata_to_entry(path: &Path) -> Result<FileEntry, String> {
    let meta = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {e}", path.display()))?;

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let extension = if meta.is_file() {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_string())
    } else {
        None
    };

    let modified = meta
        .modified()
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
                // Format as ISO 8601 UTC without chrono dependency for simplicity.
                // We convert epoch seconds to a date string manually.
                let secs = d.as_secs();
                epoch_to_iso(secs)
            })
        })
        .unwrap_or_else(|| "unknown".to_string());

    let path_str = path
        .to_str()
        .ok_or_else(|| format!("Path is not valid UTF-8: {}", path.display()))?
        .to_string();

    Ok(FileEntry {
        name,
        path: path_str,
        is_dir: meta.is_dir(),
        is_file: meta.is_file(),
        size: if meta.is_file() { meta.len() } else { 0 },
        modified,
        extension,
    })
}

/// Minimal epoch-to-ISO-8601 conversion (UTC) without external crates.
fn epoch_to_iso(epoch_secs: u64) -> String {
    // Days from epoch to each month boundary in a non-leap / leap year.
    fn is_leap(y: u64) -> bool {
        (y.is_multiple_of(4) && !y.is_multiple_of(100)) || y.is_multiple_of(400)
    }

    let mut remaining = epoch_secs;
    let secs = remaining % 60;
    remaining /= 60;
    let mins = remaining % 60;
    remaining /= 60;
    let hours = remaining % 24;
    remaining /= 24; // remaining is now days since epoch

    // Compute year
    let mut year: u64 = 1970;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        year += 1;
    }

    // Compute month
    let month_days: [u64; 12] = [
        31,
        if is_leap(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u64;
    for &days in &month_days {
        if remaining < days {
            break;
        }
        remaining -= days;
        month += 1;
    }
    let day = remaining + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, mins, secs
    )
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// OS / desktop-environment clutter that should never appear in the file tree,
/// regardless of the `show_hidden` toggle. `show_hidden` is for *user* dotfiles
/// (`.gitignore`, `.env`, `.github/`…) — these entries are machine droppings
/// the user never authored and never wants to see.
fn is_os_system_entry(name: &str) -> bool {
    const EXACT: &[&str] = &[
        // macOS
        ".DS_Store",
        ".AppleDouble",
        ".LSOverride",
        ".Spotlight-V100",
        ".Trashes",
        ".fseventsd",
        ".DocumentRevisions-V100",
        ".TemporaryItems",
        ".VolumeIcon.icns",
        ".com.apple.timemachine.donotpresent",
        ".apdisk",
        // Windows
        "Thumbs.db",
        "ehthumbs.db",
        "Desktop.ini",
        "$RECYCLE.BIN",
        "System Volume Information",
        // Linux desktop envs
        ".directory",
    ];
    EXACT.contains(&name)
        // AppleDouble resource forks ("._<name>") and Linux per-mount trash dirs.
        || name.starts_with("._")
        || name.starts_with(".Trash-")
}

/// List the contents of a directory, sorted: directories first (alphabetical),
/// then files (alphabetical). User dotfiles (name starts with `.`) are included
/// when `show_hidden` is true. OS/system clutter (`.DS_Store`, `Thumbs.db`, …)
/// is always omitted — see [`is_os_system_entry`].
#[tauri::command]
pub fn files_list_dir(
    path: String,
    show_hidden: Option<bool>,
    workspace: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_path = validate_path(&path, workspace_buf.as_deref())?;
    let dir = safe_path.as_path();

    if !dir.exists() {
        return Err(format!("Path does not exist: {}", dir.display()));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", dir.display()));
    }

    let read_dir = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?;

    let mut dirs: Vec<FileEntry> = Vec::new();
    let mut files: Vec<FileEntry> = Vec::new();

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let entry_name = entry.file_name();
        let name_str = entry_name.to_string_lossy();

        // Always omit OS/system clutter (.DS_Store, Thumbs.db, …), even when
        // show_hidden is true — the user never authored these.
        if is_os_system_entry(&name_str) {
            continue;
        }

        // Skip hidden files/directories unless show_hidden is true.
        if !show_hidden.unwrap_or(false) && name_str.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        let file_entry = match metadata_to_entry(&entry_path) {
            Ok(fe) => fe,
            Err(_) => continue,
        };

        if file_entry.is_dir {
            dirs.push(file_entry);
        } else {
            files.push(file_entry);
        }
    }

    // Sort each group alphabetically (case-insensitive).
    dirs.sort_by_key(|a| a.name.to_lowercase());
    files.sort_by_key(|a| a.name.to_lowercase());

    dirs.extend(files);
    Ok(dirs)
}

/// Read a text file, capped at `max_bytes` (default 1 MiB).
#[tauri::command]
pub fn files_read_text(
    path: String,
    max_bytes: Option<u64>,
    workspace: Option<String>,
) -> Result<String, String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_path = validate_path(&path, workspace_buf.as_deref())?;
    let max = max_bytes.unwrap_or(1_048_576); // 1 MiB default
    let file_path = safe_path.as_path();

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", file_path.display()));
    }

    let meta = fs::metadata(file_path).map_err(|e| format!("Failed to read metadata: {e}"))?;

    let size = meta.len();
    let read_len = size.min(max) as usize;

    // Read only up to max_bytes.
    use std::io::Read;
    let mut file = fs::File::open(file_path).map_err(|e| format!("Failed to open file: {e}"))?;

    let mut buf = vec![0u8; read_len];
    file.read_exact(&mut buf[..read_len])
        .map_err(|e| format!("Failed to read file: {e}"))?;

    // Convert to UTF-8, replacing invalid sequences.
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Write text content to a file (creates or overwrites).
#[tauri::command]
pub fn files_write_text(
    path: String,
    content: String,
    workspace: Option<String>,
) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_path = validate_path(&path, workspace_buf.as_deref())?;
    std::fs::write(&safe_path, content)
        .map_err(|e| format!("Failed to write {}: {e}", safe_path.display()))
}

/// Open a file, folder, or workspace in VS Code.
#[tauri::command]
pub fn files_open_in_vscode(path: String) -> Result<(), String> {
    let safe_path = validate_path(&path, None)?;
    std::process::Command::new("code")
        .arg(&safe_path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {e}. Is 'code' command installed?"))?;
    Ok(())
}

/// Return metadata for a single path (file or directory).
#[tauri::command]
pub fn files_get_metadata(path: String) -> Result<FileEntry, String> {
    let safe_path = validate_path(&path, None)?;
    let p = safe_path.as_path();
    if !p.exists() {
        return Err(format!("Path does not exist: {}", p.display()));
    }
    metadata_to_entry(p)
}

/// Rename (move) a file or directory.
#[tauri::command]
pub fn files_rename(
    old_path: String,
    new_path: String,
    workspace: Option<String>,
) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let workspace_root = workspace_buf.as_deref();
    let safe_src = validate_path(&old_path, workspace_root)?;
    let safe_dst = validate_path(&new_path, workspace_root)?;
    let src = safe_src.as_path();
    let dst = safe_dst.as_path();
    if !src.exists() {
        return Err(format!("Path does not exist: {}", src.display()));
    }
    if dst.exists() {
        return Err(format!("Destination already exists: {}", dst.display()));
    }
    fs::rename(src, dst).map_err(|e| {
        format!(
            "Failed to rename {} → {}: {e}",
            src.display(),
            dst.display()
        )
    })
}

/// Create a directory (and any missing parent directories).
#[tauri::command]
pub fn files_create_dir(path: String, workspace: Option<String>) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_path = validate_path(&path, workspace_buf.as_deref())?;
    fs::create_dir_all(&safe_path)
        .map_err(|e| format!("Failed to create directory {}: {e}", safe_path.display()))
}

/// Delete a file or directory (recursively for directories).
#[tauri::command]
pub fn files_delete(path: String, workspace: Option<String>) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_path = validate_path(&path, workspace_buf.as_deref())?;
    let p = safe_path.as_path();
    if !p.exists() {
        return Err(format!("Path does not exist: {}", p.display()));
    }
    if p.is_dir() {
        fs::remove_dir_all(p)
            .map_err(|e| format!("Failed to delete directory {}: {e}", p.display()))
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to delete file {}: {e}", p.display()))
    }
}
