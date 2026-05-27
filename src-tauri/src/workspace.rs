//! Workspace initialization — copies bundled resource templates to a workspace directory.

use crate::home;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Recursively copy a directory, skipping files that already exist in the destination.
#[cfg(test)]
fn copy_dir_skip_existing(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        log::debug!(
            "copy_dir_skip_existing: source does not exist, skipping: {}",
            src.display()
        );
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| {
        log::error!("Failed to create directory {}: {e}", dst.display());
        format!("Failed to create {}: {e}", dst.display())
    })?;

    let entries = fs::read_dir(src).map_err(|e| {
        log::error!("Failed to read directory {}: {e}", src.display());
        format!("Failed to read {}: {e}", src.display())
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Skip hidden OS files
        if name_str == ".DS_Store" || name_str == "Thumbs.db" {
            log::debug!("Skipping OS metadata file: {}", src_path.display());
            continue;
        }

        let dst_path = dst.join(&name);

        if src_path.is_dir() {
            copy_dir_skip_existing(&src_path, &dst_path)?;
        } else if !dst_path.exists() {
            // Only copy if destination file doesn't exist (don't overwrite user edits)
            log::debug!(
                "Copying file: {} → {}",
                src_path.display(),
                dst_path.display()
            );
            fs::copy(&src_path, &dst_path).map_err(|e| {
                log::error!(
                    "Failed to copy {} → {}: {e}",
                    src_path.display(),
                    dst_path.display()
                );
                format!(
                    "Failed to copy {} → {}: {e}",
                    src_path.display(),
                    dst_path.display()
                )
            })?;
        } else {
            log::debug!("Skipping existing file: {}", dst_path.display());
        }
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // Helper: write a file with given content relative to a base directory.
    fn write_file(base: &std::path::Path, name: &str, content: &str) {
        fs::write(base.join(name), content).unwrap();
    }

    // Helper: read a file's text content relative to a base directory.
    fn read_file(base: &std::path::Path, name: &str) -> String {
        fs::read_to_string(base.join(name)).unwrap()
    }

    // ── copy_dir_skip_existing ─────────────────────────────────────────────

    /// Files present in `src` but absent from `dst` are copied correctly.
    #[test]
    fn copy_dir_copies_new_files() {
        let src_dir = tempfile::tempdir().expect("src tempdir");
        let dst_dir = tempfile::tempdir().expect("dst tempdir");

        write_file(src_dir.path(), "hello.txt", "hello world");
        write_file(src_dir.path(), "readme.md", "# readme");

        copy_dir_skip_existing(src_dir.path(), dst_dir.path()).expect("copy should succeed");

        assert_eq!(read_file(dst_dir.path(), "hello.txt"), "hello world");
        assert_eq!(read_file(dst_dir.path(), "readme.md"), "# readme");
    }

    /// Files that already exist in `dst` are NOT overwritten.
    #[test]
    fn copy_dir_skips_existing_files() {
        let src_dir = tempfile::tempdir().expect("src tempdir");
        let dst_dir = tempfile::tempdir().expect("dst tempdir");

        write_file(src_dir.path(), "config.toml", "src content");
        // Pre-populate the destination with different content.
        write_file(dst_dir.path(), "config.toml", "user content");

        copy_dir_skip_existing(src_dir.path(), dst_dir.path()).expect("copy should succeed");

        // Destination must retain the original user content.
        assert_eq!(
            read_file(dst_dir.path(), "config.toml"),
            "user content",
            "existing destination file must not be overwritten"
        );
    }

    /// `.DS_Store` files are silently skipped and never copied to the destination.
    #[test]
    fn copy_dir_skips_ds_store() {
        let src_dir = tempfile::tempdir().expect("src tempdir");
        let dst_dir = tempfile::tempdir().expect("dst tempdir");

        write_file(src_dir.path(), ".DS_Store", "apple garbage");
        write_file(src_dir.path(), "real_file.txt", "real content");

        copy_dir_skip_existing(src_dir.path(), dst_dir.path()).expect("copy should succeed");

        assert!(
            !dst_dir.path().join(".DS_Store").exists(),
            ".DS_Store must not be copied to the destination"
        );
        assert!(dst_dir.path().join("real_file.txt").exists());
    }

    /// `Thumbs.db` (Windows thumbnail cache) is also skipped.
    #[test]
    fn copy_dir_skips_thumbs_db() {
        let src_dir = tempfile::tempdir().expect("src tempdir");
        let dst_dir = tempfile::tempdir().expect("dst tempdir");

        write_file(src_dir.path(), "Thumbs.db", "windows garbage");

        copy_dir_skip_existing(src_dir.path(), dst_dir.path()).expect("copy should succeed");

        assert!(
            !dst_dir.path().join("Thumbs.db").exists(),
            "Thumbs.db must not be copied to the destination"
        );
    }

    /// When `src` does not exist, the function returns `Ok(())` without error.
    #[test]
    fn copy_dir_is_noop_when_source_missing() {
        let dst_dir = tempfile::tempdir().expect("dst tempdir");
        let non_existent = dst_dir.path().join("does_not_exist");

        let result = copy_dir_skip_existing(&non_existent, dst_dir.path());
        assert!(result.is_ok(), "missing source should not be an error");
    }

    /// Nested sub-directories are copied recursively.
    #[test]
    fn copy_dir_copies_nested_directories() {
        let src_dir = tempfile::tempdir().expect("src tempdir");
        let dst_dir = tempfile::tempdir().expect("dst tempdir");

        let sub = src_dir.path().join("subdir");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("nested.txt"), "nested content").unwrap();

        copy_dir_skip_existing(src_dir.path(), dst_dir.path()).expect("copy should succeed");

        assert_eq!(
            read_file(&dst_dir.path().join("subdir"), "nested.txt"),
            "nested content"
        );
    }

    // ── resolve_template ───────────────────────────────────────────────────────

    /// When a user override exists it is returned instead of the bundled file.
    #[test]
    fn resolve_template_prefers_user_override() {
        let user_dir = tempfile::tempdir().expect("user tempdir");
        let bundled_dir = tempfile::tempdir().expect("bundled tempdir");

        // Write both user and bundled copies.
        write_file(user_dir.path(), "CLAUDE.md", "user override");
        write_file(bundled_dir.path(), "CLAUDE.md", "bundled default");

        // Override LITEDUCK_HOME so home_dir() points at our temp directory.
        // The user template is expected at <home>/templates/workspace/CLAUDE.md.
        let fake_home = tempfile::tempdir().expect("fake home tempdir");
        let user_tmpl_dir = fake_home.path().join("templates").join("workspace");
        fs::create_dir_all(&user_tmpl_dir).unwrap();
        fs::copy(
            user_dir.path().join("CLAUDE.md"),
            user_tmpl_dir.join("CLAUDE.md"),
        )
        .unwrap();

        // Point home_dir() at our fake home.
        std::env::set_var("LITEDUCK_HOME", fake_home.path());

        let result = resolve_template(bundled_dir.path(), "CLAUDE.md");

        // Restore env before asserting (so other tests aren't affected).
        std::env::remove_var("LITEDUCK_HOME");

        let resolved = result.expect("should resolve to Some path");
        assert_eq!(
            resolved,
            user_tmpl_dir.join("CLAUDE.md"),
            "user override must be preferred over bundled file"
        );
    }

    /// When no user override exists the bundled resource is returned.
    #[test]
    fn resolve_template_falls_back_to_bundled() {
        let bundled_dir = tempfile::tempdir().expect("bundled tempdir");
        write_file(bundled_dir.path(), "CLAUDE.md", "bundled claude");

        // Use a fake home dir that has no templates sub-directory.
        let fake_home = tempfile::tempdir().expect("fake home tempdir");
        std::env::set_var("LITEDUCK_HOME", fake_home.path());

        let result = resolve_template(bundled_dir.path(), "CLAUDE.md");

        std::env::remove_var("LITEDUCK_HOME");

        let resolved = result.expect("should resolve to Some path");
        assert_eq!(
            resolved,
            bundled_dir.path().join("CLAUDE.md"),
            "bundled file must be returned when no user override exists"
        );
    }

    /// When neither user override nor bundled resource exists, None is returned.
    #[test]
    fn resolve_template_returns_none_when_missing() {
        let bundled_dir = tempfile::tempdir().expect("bundled tempdir");
        // Do NOT write any file into bundled_dir.

        let fake_home = tempfile::tempdir().expect("fake home tempdir");
        std::env::set_var("LITEDUCK_HOME", fake_home.path());

        let result = resolve_template(bundled_dir.path(), "NONEXISTENT.md");

        std::env::remove_var("LITEDUCK_HOME");

        assert!(
            result.is_none(),
            "resolve_template must return None when neither source exists"
        );
    }
}

/// CLI tool files copied to the WORKSPACE ROOT.
const CLI_TEMPLATE_FILES: &[(&str, &str)] = &[];

/// Resolve a template file path. Checks user templates first, then bundled resources.
///
/// Resolution order:
/// 1. `~/.liteduck/templates/workspace/<template_name>` (user override)
/// 2. `<resource_dir>/<template_name>` (bundled default)
///
/// Returns `None` if neither location contains the file.
fn resolve_template(resource_dir: &Path, template_name: &str) -> Option<PathBuf> {
    // 1. Check user override: ~/.liteduck/templates/workspace/<template_name>
    let user_template = home::home_dir()
        .join("templates")
        .join("workspace")
        .join(template_name);
    if user_template.exists() {
        log::info!("Using user template override for {template_name}");
        return Some(user_template);
    }

    // 2. Fall back to bundled resource
    let bundled = resource_dir.join(template_name);
    if bundled.exists() {
        return Some(bundled);
    }

    None
}

/// Information about a single template, including whether it is a user override
/// or the bundled default.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TemplateInfo {
    pub name: String,
    /// `"user"` when the file comes from `~/.liteduck/templates/workspace/`,
    /// `"bundled"` when it comes from the app resources.
    pub source: String,
    pub path: String,
}

/// List all known workspace templates together with their resolved source.
///
/// For each entry in `CLI_TEMPLATE_FILES` the function checks whether a user
/// override exists in `~/.liteduck/templates/workspace/` and marks it
/// accordingly.  If neither the user file nor the bundled file exists the
/// entry is omitted from the result.
#[tauri::command]
pub fn home_templates_list(app: tauri::AppHandle) -> Result<Vec<TemplateInfo>, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| {
            log::error!("home_templates_list: failed to resolve resource dir: {e}");
            format!("Failed to resolve resource dir: {e}")
        })?
        .join("resources");

    let user_template_dir = home::home_dir().join("templates").join("workspace");

    let mut result = Vec::new();

    for (src_rel, _dst_name) in CLI_TEMPLATE_FILES {
        // User override path
        let user_path = user_template_dir.join(src_rel);
        if user_path.exists() {
            result.push(TemplateInfo {
                name: src_rel.to_string(),
                source: "user".to_string(),
                path: user_path.to_string_lossy().to_string(),
            });
            continue;
        }

        // Bundled fallback
        let bundled_path = resource_dir.join(src_rel);
        if bundled_path.exists() {
            result.push(TemplateInfo {
                name: src_rel.to_string(),
                source: "bundled".to_string(),
                path: bundled_path.to_string_lossy().to_string(),
            });
        }
    }

    Ok(result)
}

/// Check whether a path exists on disk (file or directory).
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Scaffold a new project inside `workspace` using the given `template`.
///
/// Supported templates:
/// - `"git-init"`   — run `git init`
/// - `"react-vite"` — run `npm create vite@latest . -- --template react-ts`
/// - `"node"`       — run `npm init -y`
/// - `"python"`     — run `python3 -m venv .venv`
/// - `"rust"`       — run `cargo init`
#[tauri::command]
pub async fn workspace_scaffold(workspace: String, template: String) -> Result<String, String> {
    use std::process::Command;

    let ws_path = Path::new(&workspace);
    if !ws_path.exists() {
        std::fs::create_dir_all(ws_path)
            .map_err(|e| format!("Failed to create workspace: {}", e))?;
    }

    let (cmd, args): (String, Vec<String>) = match template.as_str() {
        "git-init" => ("git".into(), vec!["init".into()]),
        "react-vite" => (
            "npm".into(),
            vec![
                "create".into(),
                "vite@latest".into(),
                ".".into(),
                "--yes".into(),
                "--".into(),
                "--template".into(),
                "react-ts".into(),
            ],
        ),
        "node" => ("npm".into(), vec!["init".into(), "-y".into()]),
        "python" => (
            "python3".into(),
            vec!["-m".into(), "venv".into(), ".venv".into()],
        ),
        "rust" => ("cargo".into(), vec!["init".into()]),
        _ => return Err(format!("Unknown template: {}", template)),
    };

    log::info!("workspace_scaffold: running '{cmd}' in '{workspace}' (template={template})");

    let output = tokio::task::spawn_blocking(move || {
        Command::new(&cmd)
            .args(&args)
            .current_dir(&workspace)
            .output()
            .map_err(|e| format!("Failed to run {}: {}", cmd, e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    if output.status.success() {
        log::info!("workspace_scaffold: template '{template}' succeeded");
        Ok(format!("Project initialized with template '{}'", template))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("workspace_scaffold: template '{template}' failed: {stderr}");
        Err(format!("Template '{}' failed: {}", template, stderr))
    }
}

/// Initializes a workspace by copying bundled template files.
///
/// Only copies files that don't already exist — safe to call multiple times
/// without overwriting user modifications.
#[tauri::command]
pub fn workspace_init(
    app: tauri::AppHandle,
    workspace: String,
) -> Result<WorkspaceInitResult, String> {
    log::info!("workspace_init: starting for workspace '{workspace}'");

    let workspace_dir = Path::new(&workspace);
    if !workspace_dir.exists() {
        log::info!("workspace_init: creating workspace directory '{workspace}'");
        fs::create_dir_all(workspace_dir).map_err(|e| {
            log::error!("workspace_init: failed to create workspace directory '{workspace}': {e}");
            format!("Failed to create workspace directory: {e}")
        })?;
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| {
            log::error!("workspace_init: failed to resolve resource dir: {e}");
            format!("Failed to resolve resource dir: {e}")
        })?
        .join("resources");

    let copied_dirs: Vec<String> = Vec::new();
    let mut copied_files: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();

    // Copy CLI tool files to workspace ROOT (only when templates exist)
    if !CLI_TEMPLATE_FILES.is_empty() {
        if !resource_dir.exists() {
            log::warn!(
                "workspace_init: bundled resources not found at {} — skipping template copy",
                resource_dir.display()
            );
        } else {
            log::debug!(
                "workspace_init: using resource dir '{}'",
                resource_dir.display()
            );
            for (src_rel, dst_name) in CLI_TEMPLATE_FILES {
                let src = match resolve_template(&resource_dir, src_rel) {
                    Some(path) => path,
                    None => {
                        log::debug!("workspace_init: template not found: {src_rel}");
                        continue;
                    }
                };
                let dst = workspace_dir.join(dst_name);

                if dst.exists() {
                    log::debug!(
                        "workspace_init: CLI template file '{dst_name}' already exists, skipping"
                    );
                    skipped.push(dst_name.to_string());
                } else {
                    log::info!(
                        "workspace_init: copying CLI template file '{src_rel}' → {dst_name}"
                    );
                    fs::copy(&src, &dst).map_err(|e| {
                        log::error!("workspace_init: failed to copy '{dst_name}': {e}");
                        format!("Failed to copy {dst_name}: {e}")
                    })?;
                    copied_files.push(dst_name.to_string());
                }
            }
        }
    }

    log::info!(
        "workspace_init: done — dirs created: {}, files copied: {}, skipped: {}",
        copied_dirs.len(),
        copied_files.len(),
        skipped.len()
    );

    Ok(WorkspaceInitResult {
        copied_dirs,
        copied_files,
        skipped,
    })
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WorkspaceInitResult {
    pub copied_dirs: Vec<String>,
    pub copied_files: Vec<String>,
    pub skipped: Vec<String>,
}

/// Status of a single template item in the workspace.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TemplateItemStatus {
    pub name: String,
    pub is_dir: bool,
    pub present: bool,
}

/// Check which LiteDuck template directories and files exist in the workspace.
#[tauri::command]
pub fn workspace_check_templates(workspace: String) -> Result<Vec<TemplateItemStatus>, String> {
    let ws = Path::new(&workspace);
    if !ws.exists() {
        return Err(format!("Workspace does not exist: {workspace}"));
    }

    let mut items = Vec::new();

    for (_src_rel, dst_name) in CLI_TEMPLATE_FILES {
        let file_path = ws.join(dst_name);
        items.push(TemplateItemStatus {
            name: dst_name.to_string(),
            is_dir: false,
            present: file_path.exists(),
        });
    }

    Ok(items)
}

/// Re-initialize a single template directory or file, forcing a fresh copy
/// from bundled resources (merges missing files only).
#[tauri::command]
pub fn workspace_init_template(
    app: tauri::AppHandle,
    workspace: String,
    template_name: String,
) -> Result<String, String> {
    log::info!("workspace_init_template: '{template_name}' in workspace '{workspace}'");

    let ws = Path::new(&workspace);
    if !ws.exists() {
        log::warn!("workspace_init_template: workspace does not exist: '{workspace}'");
        return Err(format!("Workspace does not exist: {workspace}"));
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| {
            log::error!("workspace_init_template: failed to resolve resource dir: {e}");
            format!("Failed to resolve resource dir: {e}")
        })?
        .join("resources");

    if !resource_dir.exists() {
        log::warn!(
            "workspace_init_template: bundled resources not found at {} — template copy may fail",
            resource_dir.display()
        );
    }

    // Check if it's a CLI tool file template
    if let Some((src_rel, dst_name)) = CLI_TEMPLATE_FILES.iter().find(|(_, d)| *d == template_name)
    {
        let src = match resolve_template(&resource_dir, src_rel) {
            Some(path) => path,
            None => {
                log::error!(
                    "workspace_init_template: template not found (user or bundled): '{src_rel}'"
                );
                return Err(format!("Template source not found: {template_name}"));
            }
        };
        let dst = ws.join(dst_name);
        if !dst.exists() {
            log::info!(
                "workspace_init_template: copying CLI template file '{src_rel}' → {dst_name}"
            );
            fs::copy(&src, &dst).map_err(|e| {
                log::error!("workspace_init_template: failed to copy '{dst_name}': {e}");
                format!("Failed to copy {dst_name}: {e}")
            })?;
        } else {
            log::debug!(
                "workspace_init_template: CLI template file '{dst_name}' already exists, skipping"
            );
        }
        log::info!("workspace_init_template: done — {dst_name}");
        return Ok(format!("Initialized {dst_name}"));
    }

    log::warn!("workspace_init_template: unknown template name '{template_name}'");
    Err(format!("Unknown template: {template_name}"))
}
