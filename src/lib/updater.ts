import { invoke } from "@tauri-apps/api/core";
import { hasNativeCapabilities } from "@/lib/platform";

// ── Guard ─────────────────────────────────────────────────────────────────────

function guardNativeOnly(fn: string): void {
  if (!hasNativeCapabilities()) {
    throw new Error(`${fn} is not available on this platform`);
  }
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_url: string;
  release_notes: string;
  published_at: string;
  download_url: string;
  download_filename: string;
  download_size: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

/**
 * Check GitHub releases for the latest version.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  guardNativeOnly("checkForUpdate");
  return invoke<UpdateInfo>("check_for_update");
}

/**
 * Download the update installer to a temp directory.
 * Listen for "update-download-progress" events for progress.
 */
export async function downloadUpdate(url: string, filename: string): Promise<string> {
  guardNativeOnly("downloadUpdate");
  return invoke<string>("download_update", { url, filename });
}

/**
 * Open/install the downloaded update file.
 */
export async function installUpdate(path: string): Promise<void> {
  guardNativeOnly("installUpdate");
  await invoke<null>("install_update", { path });
}

/**
 * Get the current app version (no network request).
 * Falls back to Tauri app API on iOS where the updater module is excluded.
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>("get_app_version");
  } catch {
    // On iOS the updater Rust module is excluded — read from Tauri app config
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  }
}
