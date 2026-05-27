import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: [string, string][];
  untracked: string[];
}

export interface GitCommit {
  oid: string;
  message: string;
  author: string;
  author_email: string;
  time: string;
  parents: string[];
}

export interface GitDiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  old_path: string | null;
}

export interface GitDiffLine {
  content: string;
  origin: "+" | "-" | " ";
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface GitDiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: GitDiffLine[];
}

export interface GitDiffResult {
  files: GitDiffFile[];
  hunks: Record<string, GitDiffHunk[]>;
}

// ── API wrappers ──────────────────────────────────────────────────────────────

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { repoPath });
}

export async function gitLog(repoPath: string, maxCount?: number): Promise<GitCommit[]> {
  return invoke<GitCommit[]>("git_log", { repoPath, maxCount: maxCount ?? null });
}

export async function gitDiffWorking(repoPath: string): Promise<GitDiffResult> {
  return invoke<GitDiffResult>("git_diff_working", { repoPath });
}

export async function gitDiffCommit(repoPath: string, oid: string): Promise<GitDiffResult> {
  return invoke<GitDiffResult>("git_diff_commit", { repoPath, oid });
}

export async function gitCurrentBranch(repoPath: string): Promise<string> {
  return invoke<string>("git_current_branch", { repoPath });
}

export async function gitListBranches(repoPath: string): Promise<string[]> {
  return invoke<string[]>("git_list_branches", { repoPath });
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  is_main: boolean;
  is_dirty: boolean;
}

export async function gitWorktreeList(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>("git_worktree_list", { repoPath });
}

export async function gitWorktreeAdd(
  repoPath: string,
  path: string,
  branch: string,
  createBranch: boolean,
): Promise<void> {
  return invoke<undefined>("git_worktree_add", {
    repoPath,
    path,
    branch,
    createBranch,
  });
}

export async function gitWorktreeRemove(repoPath: string, path: string): Promise<void> {
  return invoke<undefined>("git_worktree_remove", { repoPath, path });
}

export async function gitWorktreePrune(repoPath: string): Promise<void> {
  return invoke<undefined>("git_worktree_prune", { repoPath });
}

export async function gitInit(path: string): Promise<void> {
  return invoke<undefined>("git_init", { path });
}

export interface ScannedRepo {
  path: string;
  name: string;
  relative_path: string;
}

export async function gitScanRepos(
  workspacePath: string,
  maxDepth?: number,
  extraExcludes?: string[],
): Promise<ScannedRepo[]> {
  return invoke<ScannedRepo[]>("git_scan_repos", {
    workspacePath,
    maxDepth: maxDepth ?? null,
    extraExcludes: extraExcludes ?? null,
  });
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Returns the first 7 characters of an OID (short SHA). */
export function shortOid(oid: string): string {
  return oid.slice(0, 7);
}

/** Returns a relative time string for a given ISO timestamp. */
export function relativeTime(isoTime: string): string {
  const date = new Date(isoTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

/** Total changed file count from a GitStatus. */
export function statusFileCount(status: GitStatus): number {
  return (
    status.modified.length +
    status.added.length +
    status.deleted.length +
    status.renamed.length +
    status.untracked.length
  );
}
