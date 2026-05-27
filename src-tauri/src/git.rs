use git2::{Delta, DiffLineType, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    // Working-tree changes (unstaged)
    pub modified: Vec<String>,
    pub added: Vec<String>,
    pub deleted: Vec<String>,
    pub renamed: Vec<(String, String)>,
    pub untracked: Vec<String>,
    // Index changes (staged, differ from HEAD)
    pub staged_modified: Vec<String>,
    pub staged_added: Vec<String>,
    pub staged_deleted: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub time: String,
    pub parents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffLine {
    pub content: String,
    pub origin: char,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffResult {
    pub files: Vec<GitDiffFile>,
    pub hunks: HashMap<String, Vec<GitDiffHunk>>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn open_repo(repo_path: &str) -> Result<Repository, String> {
    Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {e}"))
}

fn delta_to_status(delta: Delta) -> &'static str {
    match delta {
        Delta::Modified => "modified",
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Renamed => "renamed",
        Delta::Copied => "added",
        Delta::Untracked => "untracked",
        _ => "modified",
    }
}

fn diff_to_result(diff: git2::Diff<'_>) -> Result<GitDiffResult, String> {
    let mut files: Vec<GitDiffFile> = Vec::new();
    let mut hunks: HashMap<String, Vec<GitDiffHunk>> = HashMap::new();

    // Collect file entries
    for delta in diff.deltas() {
        let status = delta_to_status(delta.status()).to_string();
        let new_file = delta.new_file();
        let old_file = delta.old_file();

        let path = new_file
            .path()
            .or_else(|| old_file.path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let old_path = if delta.status() == Delta::Renamed || delta.status() == Delta::Copied {
            old_file
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|p| p != &path)
        } else {
            None
        };

        files.push(GitDiffFile {
            path: path.clone(),
            status,
            old_path,
        });

        hunks.insert(path, Vec::new());
    }

    // Collect hunks and lines via foreach
    // We use a shared mutable state via RefCell pattern through foreach callbacks.
    use std::cell::RefCell;

    struct State {
        current_file: Option<String>,
        current_hunk: Option<GitDiffHunk>,
        hunks: HashMap<String, Vec<GitDiffHunk>>,
    }

    let state = RefCell::new(State {
        current_file: None,
        current_hunk: None,
        hunks,
    });

    diff.foreach(
        &mut |delta, _progress| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut s = state.borrow_mut();
            // flush previous hunk if any
            if let (Some(file), Some(hunk)) = (s.current_file.take(), s.current_hunk.take()) {
                s.hunks.entry(file).or_default().push(hunk);
            }
            s.current_file = Some(path);
            true
        },
        None, // binary callback
        Some(&mut |delta, hunk| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let header = String::from_utf8_lossy(hunk.header()).to_string();
            let new_hunk = GitDiffHunk {
                header: header.trim_end().to_string(),
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                lines: Vec::new(),
            };
            let mut s = state.borrow_mut();
            // flush previous hunk – take() moves without cloning and resets the
            // field to None in one step, matching the assignment on the next line.
            if let (Some(file), Some(prev_hunk)) = (s.current_file.take(), s.current_hunk.take()) {
                s.hunks.entry(file).or_default().push(prev_hunk);
            }
            s.current_file = Some(path);
            s.current_hunk = Some(new_hunk);
            true
        }),
        Some(&mut |delta, _hunk, line| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let origin = match line.origin_value() {
                DiffLineType::Addition => '+',
                DiffLineType::Deletion => '-',
                DiffLineType::Context => ' ',
                DiffLineType::AddEOFNL => '+',
                DiffLineType::DeleteEOFNL => '-',
                _ => ' ',
            };
            let content = String::from_utf8_lossy(line.content()).to_string();
            let diff_line = GitDiffLine {
                content: content
                    .trim_end_matches('\n')
                    .trim_end_matches('\r')
                    .to_string(),
                origin,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
            };
            let mut s = state.borrow_mut();
            s.current_file = Some(path);
            if let Some(ref mut hunk) = s.current_hunk {
                hunk.lines.push(diff_line);
            }
            true
        }),
    )
    .map_err(|e| format!("Failed to iterate diff: {e}"))?;

    // Flush last hunk
    let mut s = state.borrow_mut();
    if let (Some(file), Some(hunk)) = (s.current_file.take(), s.current_hunk.take()) {
        s.hunks.entry(file).or_default().push(hunk);
    }

    // Move hunks out of the RefCell contents rather than cloning the HashMap.
    let hunks = std::mem::take(&mut s.hunks);

    Ok(GitDiffResult { files, hunks })
}

// ── Inner functions (Tauri-independent business logic) ───────────────────────

/// Get git status for a repository (business logic, no Tauri dependency).
pub fn git_status_inner(repo_path: &str) -> Result<GitStatus, String> {
    let repo = open_repo(repo_path)?;

    let mut status_opts = git2::StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| format!("Failed to get status: {e}"))?;

    let mut result = GitStatus {
        modified: Vec::new(),
        added: Vec::new(),
        deleted: Vec::new(),
        renamed: Vec::new(),
        untracked: Vec::new(),
        staged_modified: Vec::new(),
        staged_added: Vec::new(),
        staged_deleted: Vec::new(),
    };

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let flags = entry.status();

        if flags.contains(git2::Status::WT_NEW) || flags.contains(git2::Status::INDEX_NEW) {
            if flags.contains(git2::Status::WT_NEW) && !flags.contains(git2::Status::INDEX_NEW) {
                result.untracked.push(path);
            } else {
                result.added.push(path);
            }
        } else if flags.contains(git2::Status::WT_DELETED)
            || flags.contains(git2::Status::INDEX_DELETED)
        {
            result.deleted.push(path);
        } else if flags.contains(git2::Status::WT_RENAMED)
            || flags.contains(git2::Status::INDEX_RENAMED)
        {
            // For renamed, head_to_index delta has old/new paths
            let old_path = entry
                .head_to_index()
                .and_then(|d| d.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            result.renamed.push((old_path, path));
        } else if flags.contains(git2::Status::WT_MODIFIED)
            || flags.contains(git2::Status::INDEX_MODIFIED)
        {
            result.modified.push(path);
        }
    }

    Ok(result)
}

/// Get git log for a repository (business logic, no Tauri dependency).
pub fn git_log_inner(repo_path: &str, max_count: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let repo = open_repo(repo_path)?;
    let limit = max_count.unwrap_or(50) as usize;

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {e}"))?;

    revwalk
        .push_head()
        .map_err(|e| format!("Failed to push HEAD: {e}"))?;

    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| format!("Failed to set sort: {e}"))?;

    let mut commits = Vec::new();

    for (i, oid_result) in revwalk.enumerate() {
        if i >= limit {
            break;
        }
        let oid = oid_result.map_err(|e| format!("Revwalk error: {e}"))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Failed to find commit {oid}: {e}"))?;

        let author = commit.author();
        let time = commit.time();

        // Convert git time to ISO 8601
        let timestamp = time.seconds();
        let offset_minutes = time.offset_minutes();
        let offset_hours = offset_minutes / 60;
        let offset_mins = (offset_minutes % 60).abs();
        let sign = if offset_minutes >= 0 { '+' } else { '-' };

        // Use chrono for ISO formatting
        let dt = chrono::DateTime::from_timestamp(timestamp, 0)
            .unwrap_or_default()
            .with_timezone(&chrono::Utc);
        let iso_time = format!(
            "{}{}{:02}:{:02}",
            dt.format("%Y-%m-%dT%H:%M:%S"),
            sign,
            offset_hours.abs(),
            offset_mins
        );

        let parents: Vec<String> = (0..commit.parent_count())
            .filter_map(|i| commit.parent_id(i).ok())
            .map(|p| p.to_string())
            .collect();

        commits.push(GitCommit {
            oid: oid.to_string(),
            message: commit.message().unwrap_or("").trim_end().to_string(),
            author: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            time: iso_time,
            parents,
        });
    }

    Ok(commits)
}

/// Get working diff (business logic, no Tauri dependency).
pub fn git_diff_working_inner(repo_path: &str) -> Result<GitDiffResult, String> {
    let repo = open_repo(repo_path)?;

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.context_lines(3);

    let diff = match head_tree {
        Some(tree) => repo
            .diff_tree_to_workdir_with_index(Some(&tree), Some(&mut diff_opts))
            .map_err(|e| format!("Failed to compute diff: {e}"))?,
        None => repo
            .diff_index_to_workdir(None, Some(&mut diff_opts))
            .map_err(|e| format!("Failed to compute diff: {e}"))?,
    };

    diff_to_result(diff)
}

/// Get current branch name (business logic, no Tauri dependency).
pub fn git_current_branch_inner(repo_path: &str) -> Result<String, String> {
    let repo = open_repo(repo_path)?;

    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {e}"))?;

    if head.is_branch() {
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    } else {
        let oid = head
            .target()
            .map(|o| o.to_string())
            .unwrap_or_else(|| "HEAD".to_string());
        Ok(format!("HEAD ({})", &oid[..7.min(oid.len())]))
    }
}

/// List local branches (business logic, no Tauri dependency).
pub fn git_list_branches_inner(repo_path: &str) -> Result<Vec<String>, String> {
    let repo = open_repo(repo_path)?;

    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| format!("Failed to list branches: {e}"))?;

    let mut result = Vec::new();
    for branch_result in branches {
        let (branch, _) = branch_result.map_err(|e| format!("Branch error: {e}"))?;
        if let Some(name) = branch
            .name()
            .map_err(|e| format!("Branch name error: {e}"))?
        {
            result.push(name.to_string());
        }
    }

    Ok(result)
}

// ── Tauri commands (thin wrappers around _inner functions) ────────────────────

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<GitStatus, String> {
    git_status_inner(&repo_path)
}

#[tauri::command]
pub fn git_log(repo_path: String, max_count: Option<u32>) -> Result<Vec<GitCommit>, String> {
    git_log_inner(&repo_path, max_count)
}

#[tauri::command]
pub fn git_diff_working(repo_path: String) -> Result<GitDiffResult, String> {
    git_diff_working_inner(&repo_path)
}

#[tauri::command]
pub fn git_diff_commit(repo_path: String, oid: String) -> Result<GitDiffResult, String> {
    let repo = open_repo(&repo_path)?;

    let obj = repo
        .revparse_single(&oid)
        .map_err(|e| format!("Failed to resolve OID '{oid}': {e}"))?;

    let commit = obj
        .peel_to_commit()
        .map_err(|e| format!("Object is not a commit: {e}"))?;

    let commit_tree = commit
        .tree()
        .map_err(|e| format!("Failed to get commit tree: {e}"))?;

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.context_lines(3);

    let diff = if commit.parent_count() == 0 {
        // Root commit: diff against empty tree
        repo.diff_tree_to_tree(None, Some(&commit_tree), Some(&mut diff_opts))
            .map_err(|e| format!("Failed to compute root commit diff: {e}"))?
    } else {
        let parent = commit
            .parent(0)
            .map_err(|e| format!("Failed to get parent commit: {e}"))?;
        let parent_tree = parent
            .tree()
            .map_err(|e| format!("Failed to get parent tree: {e}"))?;
        repo.diff_tree_to_tree(Some(&parent_tree), Some(&commit_tree), Some(&mut diff_opts))
            .map_err(|e| format!("Failed to compute commit diff: {e}"))?
    };

    diff_to_result(diff)
}

#[tauri::command]
pub fn git_current_branch(repo_path: String) -> Result<String, String> {
    git_current_branch_inner(&repo_path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
    pub is_main: bool,
    pub is_dirty: bool,
}

/// Returns true if the repository has any uncommitted changes
/// (staged, unstaged, or untracked files).
fn repo_is_dirty(repo: &Repository) -> bool {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false);

    repo.statuses(Some(&mut opts))
        .map(|s| s.iter().any(|e| !e.status().is_empty()))
        .unwrap_or(false)
}

#[tauri::command]
pub fn git_list_branches(repo_path: String) -> Result<Vec<String>, String> {
    git_list_branches_inner(&repo_path)
}

#[tauri::command]
pub fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let repo = open_repo(&repo_path)?;

    let names = repo
        .worktrees()
        .map_err(|e| format!("Failed to list worktrees: {e}"))?;

    let mut result: Vec<WorktreeInfo> = Vec::new();

    // The main worktree is not included in repo.worktrees(); add it first.
    let main_path = repo
        .workdir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.clone());

    let main_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let main_head = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .map(|o| o.to_string())
        .unwrap_or_default();

    let main_dirty = repo_is_dirty(&repo);

    result.push(WorktreeInfo {
        path: main_path,
        branch: main_branch,
        head: main_head,
        is_main: true,
        is_dirty: main_dirty,
    });

    for i in 0..names.len() {
        let name = names.get(i).unwrap_or("");
        let wt = repo
            .find_worktree(name)
            .map_err(|e| format!("Failed to find worktree '{name}': {e}"))?;

        let wt_path = wt.path().to_string_lossy().to_string();

        // Open the linked worktree repository to read its HEAD and dirty status
        let (wt_branch, wt_head, wt_dirty) = match Repository::open(wt.path()) {
            Ok(wt_repo) => {
                let branch = wt_repo
                    .head()
                    .ok()
                    .and_then(|h| h.shorthand().map(|s| s.to_string()))
                    .unwrap_or_else(|| name.to_string());
                let head = wt_repo
                    .head()
                    .ok()
                    .and_then(|h| h.target())
                    .map(|o| o.to_string())
                    .unwrap_or_default();
                let dirty = repo_is_dirty(&wt_repo);
                (branch, head, dirty)
            }
            Err(e) => {
                eprintln!("Warning: could not open worktree '{name}': {e}");
                (name.to_string(), String::new(), false)
            }
        };

        result.push(WorktreeInfo {
            path: wt_path,
            branch: wt_branch,
            head: wt_head,
            is_main: false,
            is_dirty: wt_dirty,
        });
    }

    Ok(result)
}

/// Run a `git worktree <subcommand>` in the given repo and return Ok or the stderr message.
fn run_git_worktree(repo_path: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("worktree");
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd.output().map_err(|e| {
        format!(
            "Failed to run git worktree {}: {e}",
            args.first().unwrap_or(&"")
        )
    })?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!(
            "git worktree {} failed: {stderr}",
            args.first().unwrap_or(&"")
        ))
    }
}

#[tauri::command]
pub fn git_worktree_add(
    repo_path: String,
    path: String,
    branch: String,
    create_branch: bool,
) -> Result<(), String> {
    if create_branch {
        run_git_worktree(&repo_path, &["add", "-b", &branch, &path])
    } else {
        run_git_worktree(&repo_path, &["add", &path, &branch])
    }
}

#[tauri::command]
pub fn git_worktree_remove(repo_path: String, path: String) -> Result<(), String> {
    run_git_worktree(&repo_path, &["remove", &path])
}

#[tauri::command]
pub fn git_worktree_prune(repo_path: String) -> Result<(), String> {
    run_git_worktree(&repo_path, &["prune"])
}

#[tauri::command]
pub fn git_init(path: String) -> Result<(), String> {
    Repository::init(&path).map_err(|e| format!("Failed to initialise git repository: {e}"))?;
    Ok(())
}

// ── Repo scanning ────────────────────────────────────────────────────────────

/// A discovered git repository within a workspace directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedRepo {
    /// Absolute path to the repository root (parent of `.git`).
    pub path: String,
    /// Repository name (last path component).
    pub name: String,
    /// Relative path from the workspace root.
    pub relative_path: String,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    "vendor",
];

/// Recursively scan `root` for directories containing `.git`, up to `max_depth`.
/// `extra_excludes` are additional directory names to skip on top of `SKIP_DIRS`.
fn scan_repos_inner(
    root: &Path,
    max_depth: u8,
    extra_excludes: &HashSet<String>,
) -> Result<Vec<ScannedRepo>, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("Invalid path: {e}"))?;
    let mut repos: Vec<ScannedRepo> = Vec::new();

    fn walk(
        dir: &Path,
        root: &Path,
        depth: u8,
        max_depth: u8,
        extra_excludes: &HashSet<String>,
        repos: &mut Vec<ScannedRepo>,
    ) {
        if depth > max_depth {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();

            if name == ".git" {
                // Found a repo — the parent is the repo root
                let repo_root = dir.to_path_buf();
                let relative = repo_root
                    .strip_prefix(root)
                    .unwrap_or(&repo_root)
                    .to_string_lossy()
                    .to_string();
                let repo_name = repo_root
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| relative.clone());
                repos.push(ScannedRepo {
                    path: repo_root.to_string_lossy().to_string(),
                    name: repo_name,
                    relative_path: if relative.is_empty() {
                        ".".to_string()
                    } else {
                        relative
                    },
                });
                // Don't recurse deeper into this repo's subdirectories
                // (submodules are separate .git entries at their own level)
                continue;
            }

            // Skip built-in non-project directories and user-configured patterns
            if SKIP_DIRS.contains(&name.as_str())
                || extra_excludes.contains(&name)
                || name.starts_with('.')
            {
                continue;
            }

            // Recurse into subdirectory
            walk(&path, root, depth + 1, max_depth, extra_excludes, repos);
        }
    }

    walk(&root, &root, 0, max_depth, extra_excludes, &mut repos);
    repos.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(repos)
}

#[tauri::command]
pub fn git_scan_repos(
    workspace_path: String,
    max_depth: Option<u8>,
    extra_excludes: Option<Vec<String>>,
) -> Result<Vec<ScannedRepo>, String> {
    let root = Path::new(&workspace_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {workspace_path}"));
    }
    let extra: HashSet<String> = extra_excludes
        .unwrap_or_default()
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect();
    scan_repos_inner(root, max_depth.unwrap_or(3), &extra)
}
