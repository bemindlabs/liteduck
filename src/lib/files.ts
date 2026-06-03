import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  size: number;
  modified: string;
  extension: string | null;
}

// ── File icon map ─────────────────────────────────────────────────────────────

export const FILE_ICONS: Record<string, string> = {
  // Web
  ts: "📄",
  tsx: "⚛️",
  js: "📄",
  jsx: "⚛️",
  html: "🌐",
  css: "🎨",
  scss: "🎨",
  sass: "🎨",
  // Systems
  rs: "🦀",
  go: "🐹",
  c: "⚙️",
  cpp: "⚙️",
  h: "⚙️",
  hpp: "⚙️",
  // Scripts
  py: "🐍",
  rb: "💎",
  sh: "🖥️",
  bash: "🖥️",
  zsh: "🖥️",
  // Data
  json: "📋",
  toml: "📋",
  yaml: "📋",
  yml: "📋",
  xml: "📋",
  csv: "📊",
  sql: "🗄️",
  // Docs
  md: "📝",
  mdx: "📝",
  txt: "📃",
  pdf: "📕",
  // Config
  env: "🔑",
  gitignore: "🚫",
  dockerignore: "🚫",
  dockerfile: "🐳",
  // Media
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  gif: "🖼️",
  svg: "🖼️",
  ico: "🖼️",
  webp: "🖼️",
  // Archives
  zip: "📦",
  tar: "📦",
  gz: "📦",
  // Misc
  lock: "🔒",
  log: "📜",
};

export function getFileIcon(entry: FileEntry): string {
  if (entry.is_dir) return "📁";
  if (!entry.extension) return "📄";
  return FILE_ICONS[entry.extension.toLowerCase()] ?? "📄";
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatModified(iso: string): string {
  if (iso === "unknown") return "Unknown";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── API wrappers ──────────────────────────────────────────────────────────────

/**
 * List directory contents sorted: directories first, then files, both
 * alphabetically. Hidden entries (dotfiles) are included when `showHidden` is true.
 * When `workspace` is provided, paths outside it are rejected by the backend.
 */
export async function filesListDir(
  path: string,
  showHidden?: boolean,
  workspace?: string,
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("files_list_dir", {
    path,
    showHidden: showHidden ?? null,
    workspace: workspace ?? null,
  });
}

/**
 * Read a text file, capped at maxBytes (default 1 MiB on the Rust side).
 * When `workspace` is provided, paths outside it are rejected by the backend.
 */
export async function filesReadText(
  path: string,
  maxBytes?: number,
  workspace?: string,
): Promise<string> {
  return invoke<string>("files_read_text", {
    path,
    maxBytes: maxBytes ?? null,
    workspace: workspace ?? null,
  });
}

/**
 * Write text content to a file (creates or overwrites).
 * When `workspace` is provided, paths outside it are rejected by the backend.
 */
export async function filesWriteText(
  path: string,
  content: string,
  workspace?: string,
): Promise<void> {
  return invoke<undefined>("files_write_text", { path, content, workspace: workspace ?? null });
}

/**
 * Open a file, folder, or workspace in VS Code.
 */
export async function filesOpenInVscode(path: string): Promise<void> {
  return invoke<undefined>("files_open_in_vscode", { path });
}

/**
 * Return metadata for a single path.
 */
export async function filesGetMetadata(path: string): Promise<FileEntry> {
  return invoke<FileEntry>("files_get_metadata", { path });
}

/**
 * Rename (move) a file or directory.
 * When `workspace` is provided, both source and destination must be within it.
 */
export async function filesRename(
  oldPath: string,
  newPath: string,
  workspace?: string,
): Promise<void> {
  return invoke<undefined>("files_rename", { oldPath, newPath, workspace: workspace ?? null });
}

/**
 * Create a directory (and any missing parent directories).
 * When `workspace` is provided, paths outside it are rejected by the backend.
 */
export async function filesCreateDir(path: string, workspace?: string): Promise<void> {
  return invoke<undefined>("files_create_dir", { path, workspace: workspace ?? null });
}

/**
 * Delete a file or directory (recursively for directories).
 * When `workspace` is provided, paths outside it are rejected by the backend.
 */
export async function filesDelete(path: string, workspace?: string): Promise<void> {
  return invoke<undefined>("files_delete", { path, workspace: workspace ?? null });
}

/**
 * Copy a file or directory (recursively for directories) from `src` to `dest`.
 * The backend errors if `dest` already exists — it never silently overwrites.
 * When `workspace` is provided, both paths must be within it.
 */
export async function filesCopy(src: string, dest: string, workspace?: string): Promise<void> {
  return invoke<undefined>("files_copy", { src, dest, workspace: workspace ?? null });
}

/**
 * Move (or rename) a file or directory from `src` to `dest`, including across
 * directories. Falls back to copy-then-delete on cross-device moves. The
 * backend errors if `dest` already exists. When `workspace` is provided, both
 * paths must be within it.
 */
export async function filesMove(src: string, dest: string, workspace?: string): Promise<void> {
  return invoke<undefined>("files_move", { src, dest, workspace: workspace ?? null });
}

/**
 * Reveal a path in the OS file manager (Finder on macOS via `open -R`).
 * The backend validates the path exists.
 */
export async function filesRevealInOs(path: string): Promise<void> {
  return invoke<undefined>("files_reveal_in_os", { path });
}

/**
 * Recursively search `root` for entries whose NAME contains `query`
 * (case-insensitive substring match). Dotfiles are skipped unless `showHidden`
 * is true; OS/system clutter is always skipped. Results are capped at `limit`
 * (default 200 on the Rust side). When `workspace` is provided, `root` must be
 * within it.
 */
export async function filesFind(
  root: string,
  query: string,
  limit?: number,
  showHidden?: boolean,
  workspace?: string,
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("files_find", {
    root,
    query,
    limit: limit ?? null,
    showHidden: showHidden ?? null,
    workspace: workspace ?? null,
  });
}

/**
 * Start watching `path` recursively for filesystem changes. The backend emits a
 * `files://changed` Tauri event (payload: the changed path string) on any
 * change. Watching the same path twice replaces the prior watcher.
 */
export async function filesWatch(path: string): Promise<void> {
  return invoke<undefined>("files_watch", { path });
}

/**
 * Stop watching `path`. No-op if the path was not being watched.
 */
export async function filesUnwatch(path: string): Promise<void> {
  return invoke<undefined>("files_unwatch", { path });
}
