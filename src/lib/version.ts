import { invoke } from "@tauri-apps/api/core";

/**
 * Get the current app version (no network request).
 *
 * Tries the native `get_app_version` command first (reads `CARGO_PKG_VERSION`
 * at compile time). Falls back to Tauri's built-in app API on platforms where
 * that command is not registered (e.g. iOS).
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>("get_app_version");
  } catch {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  }
}
