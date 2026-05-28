/**
 * Shell-quoting helpers for inserting file-system paths into a terminal.
 *
 * Paths dragged from the file tree onto a terminal can contain spaces, quotes,
 * and other characters the shell would otherwise interpret. We wrap each path
 * in single quotes — the only POSIX-shell quoting that needs no escaping for
 * its contents — and handle embedded single quotes with the standard
 * `'\''` close/escape/reopen idiom.
 */

/** Mime type used for internal file-tree → terminal drag payloads. */
export const LITEDUCK_PATH_MIME = "application/x-liteduck-path";

/**
 * Single-quote a path for safe insertion at a POSIX shell prompt.
 *
 * Example: `/tmp/a b'c` → `'/tmp/a b'\''c'`
 */
export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * Quote one or more paths and join them with spaces, ready to write to a PTY.
 * A single trailing space is appended so the cursor sits past the argument(s).
 * Returns an empty string when given no paths.
 */
export function quotePathsForShell(paths: string[]): string {
  const cleaned = paths.filter((p) => p.length > 0);
  if (cleaned.length === 0) return "";
  return cleaned.map(shellQuote).join(" ") + " ";
}
