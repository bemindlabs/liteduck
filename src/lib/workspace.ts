import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceInitResult {
  copied_dirs: string[];
  copied_files: string[];
  skipped: string[];
}

/**
 * Initialize a workspace by creating the workspace directory and copying any
 * bundled template files. Safe to call multiple times — existing files are
 * never overwritten.
 */
export async function workspaceInit(workspace: string): Promise<WorkspaceInitResult> {
  return invoke<WorkspaceInitResult>("workspace_init", { workspace });
}

/** Check whether a path exists on disk. */
export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export interface TemplateItemStatus {
  name: string;
  is_dir: boolean;
  present: boolean;
}

/** Check which LiteDuck template directories and files exist in the workspace. */
export async function workspaceCheckTemplates(workspace: string): Promise<TemplateItemStatus[]> {
  return invoke<TemplateItemStatus[]>("workspace_check_templates", { workspace });
}

/** Initialize a single template directory or file in the workspace. */
export async function workspaceInitTemplate(
  workspace: string,
  templateName: string,
): Promise<string> {
  return invoke<string>("workspace_init_template", { workspace, templateName });
}

/**
 * Scaffold a new project inside `workspace` using the given `template`.
 *
 * Supported templates:
 * - `"git-init"`   — run `git init`
 * - `"react-vite"` — run `npm create vite@latest . -- --template react-ts`
 * - `"node"`       — run `npm init -y`
 * - `"python"`     — run `python3 -m venv .venv`
 * - `"rust"`       — run `cargo init`
 */
export async function workspaceScaffold(workspace: string, template: string): Promise<string> {
  return invoke<string>("workspace_scaffold", { workspace, template });
}
