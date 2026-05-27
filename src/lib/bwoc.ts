import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Detection result for the external `bwoc` orchestration CLI.
 *
 * When the binary is not found, `installed` is `false` and the other fields are
 * `null` — a missing optional integration is a normal state, not an error.
 */
export interface BwocStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/**
 * A single agent row parsed from `bwoc list`.
 *
 * Parsing is lenient: `raw` always holds the original line, while `name` /
 * `role` are filled in only when they could be extracted.
 */
export interface BwocAgent {
  name: string;
  role: string | null;
  raw: string;
}

// ── API wrappers ──────────────────────────────────────────────────────────────

/**
 * Detect the `bwoc` binary and report its version + path.
 *
 * Resolves to `{ installed: false, version: null, path: null }` when the CLI is
 * not installed; only rejects on genuine execution failures.
 */
export async function bwocDetect(): Promise<BwocStatus> {
  return invoke<BwocStatus>("bwoc_detect");
}

/**
 * List the registered BWOC agents via `bwoc list`.
 *
 * Rejects with "bwoc is not installed" when the binary cannot be resolved.
 */
export async function bwocList(): Promise<BwocAgent[]> {
  return invoke<BwocAgent[]>("bwoc_list");
}
