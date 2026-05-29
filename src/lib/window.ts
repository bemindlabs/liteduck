import { invoke } from "@tauri-apps/api/core";

/**
 * Multi-window IPC wrappers.
 *
 * Each top-level window has a unique Tauri label (`main` for the first,
 * `window-<8-hex>` for the rest) and may target its own workspace. The
 * frontend learns its label via `?window=...` on the URL or by calling
 * `getCurrentWindowLabel()`, and persists per-window workspace via
 * `setWindowWorkspace(...)`.
 *
 * See `src-tauri/src/windows.rs` for the backend side.
 */

export interface WindowState {
  label: string;
  workspace?: string;
}

/**
 * Open a new top-level window.
 *
 * Pass `workspace` to land directly in that workspace; pass `undefined` to
 * land at `/landing` so the user can pick one. Returns the new window's
 * Tauri label.
 */
export const openNewWindow = (workspace?: string): Promise<string> =>
  invoke<string>("window_open", { workspace: workspace ?? null });

/** Return the recorded per-window state from `~/.liteduck/windows.json`. */
export const listWindows = (): Promise<WindowState[]> => invoke<WindowState[]>("window_list");

/**
 * Persist the workspace path for a window. Called from `WorkspaceContext`
 * whenever the user switches workspaces so the next launch can restore the
 * right workspace per window.
 */
export const setWindowWorkspace = (label: string, workspace: string): Promise<void> =>
  invoke<undefined>("window_set_workspace", { label, workspace }).then(() => undefined);

/** Return the Tauri label of the window the call is made from. */
export const getCurrentWindowLabel = (): Promise<string> => invoke<string>("window_current_label");

// ── URL query helpers ───────────────────────────────────────────────────────

/**
 * Read a query parameter from the current window's URL.
 *
 * Multi-window entry URLs look like `index.html?window=<label>&workspace=<path>`
 * so this is how each window discovers what it's meant to show on mount.
 */
export function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch {
    return null;
  }
}

/** Convenience: read the `?workspace=` query param. */
export const readUrlWorkspace = (): string | null => readUrlParam("workspace");

/** Convenience: read the `?window=` query param (window label). */
export const readUrlWindowLabel = (): string | null => readUrlParam("window");
