/**
 * fileOps — path helpers + higher-level file-manager operations (paste, duplicate)
 * built on the `files.ts` Tauri wrappers, plus a single place to surface failures.
 *
 * The backend refuses to overwrite an existing destination, so paste/duplicate first
 * resolve a collision-free name in the target directory (`name`, `name copy`,
 * `name copy 2`, …) before invoking copy/move.
 */

import { filesCopy, filesListDir, filesMove } from "@/lib/files";
import type { FileClipboard } from "@/lib/fileClipboard";
import { addNotification } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const logger = createLogger("fileOps");

// ── Path helpers (posix-style; LiteDuck paths are absolute "/"-separated) ──────

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function dirname(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx > 0 ? trimmed.slice(0, idx) : "/";
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

/** Split a filename into [stem, ext] where ext includes the leading dot ("" if none). */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  // Treat a leading-dot dotfile (".gitignore") as having no extension.
  if (dot <= 0) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}

/** Pick a name not present in `taken`, inserting " copy" / " copy N" before the ext. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const [stem, ext] = splitExt(name);
  let candidate = `${stem} copy${ext}`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${stem} copy ${n}${ext}`;
    n += 1;
  }
  return candidate;
}

// ── Error surfacing ────────────────────────────────────────────────────────────

/** Log + raise a user-visible notification for a failed file operation. */
export function surfaceFileError(action: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`${action} failed:`, err);
  addNotification("file", `${action} failed`, message);
}

// ── Operations ───────────────────────────────────────────────────────────────

async function namesIn(dir: string): Promise<Set<string>> {
  try {
    const entries = await filesListDir(dir, true);
    return new Set(entries.map((e) => e.name));
  } catch {
    return new Set();
  }
}

/**
 * Paste the clipboard into `targetDir`. Copy duplicates; cut moves (and the caller
 * should clear the clipboard on success). Returns the number of entries pasted.
 */
export async function pasteInto(targetDir: string, clip: FileClipboard): Promise<number> {
  const taken = await namesIn(targetDir);
  let done = 0;
  for (const src of clip.paths) {
    const dest = joinPath(targetDir, uniqueName(basename(src), taken));
    try {
      if (clip.op === "copy") {
        await filesCopy(src, dest);
      } else {
        await filesMove(src, dest);
      }
      taken.add(basename(dest));
      done += 1;
    } catch (err) {
      surfaceFileError(clip.op === "copy" ? "Copy" : "Move", err);
    }
  }
  return done;
}

/** Duplicate an entry next to itself with a collision-free "copy" name. */
export async function duplicateEntry(path: string): Promise<void> {
  const dir = dirname(path);
  const taken = await namesIn(dir);
  const dest = joinPath(dir, uniqueName(basename(path), taken));
  try {
    await filesCopy(path, dest);
  } catch (err) {
    surfaceFileError("Duplicate", err);
  }
}

/** Move a single entry into `targetDir` (used by drag-and-drop), avoiding collisions. */
export async function moveInto(srcPath: string, targetDir: string): Promise<void> {
  if (dirname(srcPath) === targetDir) return; // dropped onto its own parent — no-op
  const taken = await namesIn(targetDir);
  const dest = joinPath(targetDir, uniqueName(basename(srcPath), taken));
  try {
    await filesMove(srcPath, dest);
  } catch (err) {
    surfaceFileError("Move", err);
  }
}
