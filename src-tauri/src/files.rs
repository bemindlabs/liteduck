use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

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

    // ── files_copy ───────────────────────────────────────────────────────────────

    /// Copying a plain file produces an identical copy at the destination.
    #[test]
    fn files_copy_copies_a_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("a.txt");
        let dst = dir.path().join("b.txt");
        fs::write(&src, "hello").unwrap();

        files_copy(
            src.to_str().unwrap().to_string(),
            dst.to_str().unwrap().to_string(),
            None,
        )
        .expect("copy should succeed");

        assert!(src.exists(), "source should remain");
        assert_eq!(fs::read_to_string(&dst).unwrap(), "hello");
    }

    /// Copying a directory recreates the whole tree at the destination.
    #[test]
    fn files_copy_copies_a_directory_recursively() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("src");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("top.txt"), "top").unwrap();
        let nested = src.join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("deep.txt"), "deep").unwrap();

        let dst = dir.path().join("dst");
        files_copy(
            src.to_str().unwrap().to_string(),
            dst.to_str().unwrap().to_string(),
            None,
        )
        .expect("recursive copy should succeed");

        assert_eq!(fs::read_to_string(dst.join("top.txt")).unwrap(), "top");
        assert_eq!(
            fs::read_to_string(dst.join("nested").join("deep.txt")).unwrap(),
            "deep"
        );
    }

    /// Copying onto an existing destination must error (no silent overwrite).
    #[test]
    fn files_copy_refuses_existing_destination() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("a.txt");
        let dst = dir.path().join("b.txt");
        fs::write(&src, "src").unwrap();
        fs::write(&dst, "existing").unwrap();

        let result = files_copy(
            src.to_str().unwrap().to_string(),
            dst.to_str().unwrap().to_string(),
            None,
        );
        assert!(result.is_err(), "copy onto existing dest must error");
        assert_eq!(
            fs::read_to_string(&dst).unwrap(),
            "existing",
            "destination must be untouched"
        );
    }

    // ── files_move ───────────────────────────────────────────────────────────────

    /// Moving a file relocates it and removes the source.
    #[test]
    fn files_move_relocates_a_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let src = dir.path().join("a.txt");
        let dst = sub.join("a.txt");
        fs::write(&src, "payload").unwrap();

        files_move(
            src.to_str().unwrap().to_string(),
            dst.to_str().unwrap().to_string(),
            None,
        )
        .expect("move should succeed");

        assert!(!src.exists(), "source should be gone after move");
        assert_eq!(fs::read_to_string(&dst).unwrap(), "payload");
    }

    /// Moving onto an existing destination must error.
    #[test]
    fn files_move_refuses_existing_destination() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("a.txt");
        let dst = dir.path().join("b.txt");
        fs::write(&src, "src").unwrap();
        fs::write(&dst, "existing").unwrap();

        let result = files_move(
            src.to_str().unwrap().to_string(),
            dst.to_str().unwrap().to_string(),
            None,
        );
        assert!(result.is_err(), "move onto existing dest must error");
        assert!(src.exists(), "source must remain on error");
    }

    // ── files_find ───────────────────────────────────────────────────────────────

    /// Find matches file names case-insensitively across nested directories.
    #[test]
    fn files_find_matches_names_case_insensitively() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("Report.md"), "x").unwrap();
        fs::write(dir.path().join("other.txt"), "x").unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("report-final.md"), "x").unwrap();

        let results = files_find(
            dir.path().to_str().unwrap().to_string(),
            "report".to_string(),
            None,
            None,
            None,
        )
        .expect("find should succeed");

        let names: Vec<&str> = results.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"Report.md"), "should match Report.md");
        assert!(
            names.contains(&"report-final.md"),
            "should match nested report-final.md"
        );
        assert!(!names.contains(&"other.txt"), "should not match other.txt");
    }

    /// Find respects the result limit cap.
    #[test]
    fn files_find_respects_limit() {
        let dir = tempfile::tempdir().expect("tempdir");
        for i in 0..10 {
            fs::write(dir.path().join(format!("match-{i}.txt")), "x").unwrap();
        }

        let results = files_find(
            dir.path().to_str().unwrap().to_string(),
            "match".to_string(),
            Some(3),
            None,
            None,
        )
        .expect("find should succeed");

        assert_eq!(results.len(), 3, "result count must be capped at limit");
    }

    /// Find skips dotfiles unless show_hidden is true.
    #[test]
    fn files_find_skips_dotfiles_unless_show_hidden() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join(".secretmatch.txt"), "x").unwrap();

        let hidden_off = files_find(
            dir.path().to_str().unwrap().to_string(),
            "secretmatch".to_string(),
            None,
            None,
            None,
        )
        .expect("find should succeed");
        assert!(hidden_off.is_empty(), "dotfile must be skipped by default");

        let hidden_on = files_find(
            dir.path().to_str().unwrap().to_string(),
            "secretmatch".to_string(),
            None,
            Some(true),
            None,
        )
        .expect("find should succeed");
        assert_eq!(hidden_on.len(), 1, "dotfile must match when show_hidden");
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

// ── Copy / Move ─────────────────────────────────────────────────────────────

/// Recursively copy a directory tree from `src` to `dst`. `dst` must not exist.
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {e}", dst.display()))?;
    let read_dir = fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {e}", src.display()))?;
    for entry_result in read_dir {
        let entry =
            entry_result.map_err(|e| format!("Failed to read entry in {}: {e}", src.display()))?;
        let entry_path = entry.path();
        let target = dst.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &target)?;
        } else {
            fs::copy(&entry_path, &target).map_err(|e| {
                format!(
                    "Failed to copy {} → {}: {e}",
                    entry_path.display(),
                    target.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Copy a file or directory (recursively) from `src` to `dest`.
///
/// Both paths are validated. The destination must NOT already exist — this
/// command never silently overwrites.
#[tauri::command]
pub fn files_copy(src: String, dest: String, workspace: Option<String>) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let workspace_root = workspace_buf.as_deref();
    let safe_src = validate_path(&src, workspace_root)?;
    let safe_dst = validate_path(&dest, workspace_root)?;
    let src_path = safe_src.as_path();
    let dst_path = safe_dst.as_path();

    if !src_path.exists() {
        return Err(format!("Source does not exist: {}", src_path.display()));
    }
    if dst_path.exists() {
        return Err(format!(
            "Destination already exists: {}",
            dst_path.display()
        ));
    }

    if src_path.is_dir() {
        copy_dir_recursive(src_path, dst_path)
    } else {
        fs::copy(src_path, dst_path).map(|_| ()).map_err(|e| {
            format!(
                "Failed to copy {} → {}: {e}",
                src_path.display(),
                dst_path.display()
            )
        })
    }
}

/// Move (or rename) a file or directory from `src` to `dest`, including across
/// directories.
///
/// Tries `std::fs::rename` first; on a cross-device link error it falls back to
/// copy-then-delete. Both paths are validated and the destination must NOT
/// already exist.
#[tauri::command]
pub fn files_move(src: String, dest: String, workspace: Option<String>) -> Result<(), String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let workspace_root = workspace_buf.as_deref();
    let safe_src = validate_path(&src, workspace_root)?;
    let safe_dst = validate_path(&dest, workspace_root)?;
    let src_path = safe_src.as_path();
    let dst_path = safe_dst.as_path();

    if !src_path.exists() {
        return Err(format!("Source does not exist: {}", src_path.display()));
    }
    if dst_path.exists() {
        return Err(format!(
            "Destination already exists: {}",
            dst_path.display()
        ));
    }

    match fs::rename(src_path, dst_path) {
        Ok(()) => Ok(()),
        Err(e) => {
            // EXDEV (cross-device link) — rename can't span filesystems. Fall
            // back to copy-then-delete. raw_os_error() == 18 on Unix.
            let is_cross_device =
                e.raw_os_error() == Some(18) || e.kind() == std::io::ErrorKind::CrossesDevices;
            if !is_cross_device {
                return Err(format!(
                    "Failed to move {} → {}: {e}",
                    src_path.display(),
                    dst_path.display()
                ));
            }
            if src_path.is_dir() {
                copy_dir_recursive(src_path, dst_path)?;
                fs::remove_dir_all(src_path).map_err(|e| {
                    format!(
                        "Moved (copied) but failed to remove source {}: {e}",
                        src_path.display()
                    )
                })
            } else {
                fs::copy(src_path, dst_path).map_err(|e| {
                    format!(
                        "Failed to copy {} → {}: {e}",
                        src_path.display(),
                        dst_path.display()
                    )
                })?;
                fs::remove_file(src_path).map_err(|e| {
                    format!(
                        "Moved (copied) but failed to remove source {}: {e}",
                        src_path.display()
                    )
                })
            }
        }
    }
}

// ── Reveal in OS ──────────────────────────────────────────────────────────────

/// Reveal a path in the OS file manager (macOS Finder via `open -R`).
///
/// The path is validated and must exist. Non-macOS platforms return an
/// explanatory error for now.
#[tauri::command]
pub fn files_reveal_in_os(path: String) -> Result<(), String> {
    let safe_path = validate_path(&path, None)?;
    let p = safe_path.as_path();
    if !p.exists() {
        return Err(format!("Path does not exist: {}", p.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(p)
            .spawn()
            .map_err(|e| format!("Failed to reveal {} in Finder: {e}", p.display()))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(format!(
            "Reveal-in-OS is not yet supported on this platform: {}",
            p.display()
        ))
    }
}

// ── Find ────────────────────────────────────────────────────────────────────

/// Maximum number of directories visited during a single `files_find` walk.
/// Guards against descending into pathologically large trees.
const FIND_MAX_DIRS: usize = 20_000;

/// Recursively search `root` for entries whose NAME contains `query`
/// (case-insensitive substring match).
///
/// OS/system clutter is always skipped; dotfiles are skipped unless
/// `show_hidden` is true. Results are capped at `limit` (default 200). The walk
/// is bounded by [`FIND_MAX_DIRS`] visited directories so very large trees do
/// not hang the search.
#[tauri::command]
pub fn files_find(
    root: String,
    query: String,
    limit: Option<usize>,
    show_hidden: Option<bool>,
    workspace: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let workspace_buf = workspace.as_deref().map(PathBuf::from);
    let safe_root = validate_path(&root, workspace_buf.as_deref())?;
    let root_path = safe_root.as_path();

    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", root_path.display()));
    }
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root_path.display()));
    }

    let cap = limit.unwrap_or(200);
    let include_hidden = show_hidden.unwrap_or(false);
    let needle = query.to_lowercase();

    let mut results: Vec<FileEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root_path.to_path_buf()];
    let mut dirs_visited: usize = 0;

    while let Some(dir) = stack.pop() {
        if results.len() >= cap || dirs_visited >= FIND_MAX_DIRS {
            break;
        }
        dirs_visited += 1;

        let read_dir = match fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(_) => continue, // skip unreadable directories gracefully
        };

        for entry_result in read_dir {
            if results.len() >= cap {
                break;
            }
            let entry = match entry_result {
                Ok(e) => e,
                Err(_) => continue,
            };
            let entry_name = entry.file_name();
            let name_str = entry_name.to_string_lossy();

            // Always omit OS/system clutter.
            if is_os_system_entry(&name_str) {
                continue;
            }
            // Skip dotfiles unless show_hidden.
            if !include_hidden && name_str.starts_with('.') {
                continue;
            }

            let entry_path = entry.path();
            let is_dir = entry_path.is_dir();

            // Case-insensitive substring match on the NAME. An empty query
            // matches everything.
            if needle.is_empty() || name_str.to_lowercase().contains(&needle) {
                if let Ok(fe) = metadata_to_entry(&entry_path) {
                    results.push(fe);
                }
            }

            if is_dir {
                stack.push(entry_path);
            }
        }
    }

    Ok(results)
}

// ── Watch / Unwatch ───────────────────────────────────────────────────────────

/// Tauri-managed state holding active filesystem watchers, keyed by the
/// validated (canonical) path string they watch. Mirrors the `PtyManager`
/// managed-state pattern.
#[derive(Default)]
pub struct FileWatchManager {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl FileWatchManager {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Start watching `path` recursively for filesystem changes. On any change the
/// backend emits a `files://changed` Tauri event whose payload is the changed
/// path (string). Watching the same path twice replaces the prior watcher.
#[tauri::command]
pub fn files_watch(
    app: AppHandle,
    state: State<'_, FileWatchManager>,
    path: String,
) -> Result<(), String> {
    let safe_path = validate_path(&path, None)?;
    let p = safe_path.as_path();
    if !p.exists() {
        return Err(format!("Path does not exist: {}", p.display()));
    }
    let key = safe_path
        .to_str()
        .ok_or_else(|| format!("Path is not valid UTF-8: {}", safe_path.display()))?
        .to_string();

    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            for changed in event.paths {
                let payload = changed.to_string_lossy().to_string();
                let _ = app_handle.emit("files://changed", payload);
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    watcher
        .watch(p, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {e}", p.display()))?;

    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| format!("Watcher state poisoned: {e}"))?;
    // Dropping any prior watcher for this key stops it.
    watchers.insert(key, watcher);
    Ok(())
}

/// Stop watching `path`. No-op if the path was not being watched.
#[tauri::command]
pub fn files_unwatch(state: State<'_, FileWatchManager>, path: String) -> Result<(), String> {
    let safe_path = validate_path(&path, None)?;
    let key = safe_path
        .to_str()
        .ok_or_else(|| format!("Path is not valid UTF-8: {}", safe_path.display()))?
        .to_string();
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| format!("Watcher state poisoned: {e}"))?;
    // Dropping the watcher (removed from the map) stops it.
    watchers.remove(&key);
    Ok(())
}
