import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsMap = Record<string, string>;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Races `promise` against a timeout. If the timeout fires first the returned
 * promise rejects with an `Error("Settings invoke timed out")`.
 *
 * Default timeout is 30 s — long enough for a cold keychain unlock prompt
 * (macOS may need 15-30 s on first access) but short enough to unblock
 * the UI if the IPC channel is stuck.
 */
function withTimeout<T>(promise: Promise<T>, ms = 30000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Settings invoke timed out")), ms),
    ),
  ]);
}

// ── API wrappers ──────────────────────────────────────────────────────────────

/**
 * Returns all non-secret settings from SQLite as a flat key/value map.
 * Secret values must be retrieved individually via {@link getSetting}.
 */
export async function getSettings(): Promise<SettingsMap> {
  return withTimeout(invoke<SettingsMap>("get_settings"));
}

/**
 * Persists a setting.
 *
 * @param key       The setting key.
 * @param value     The value to store.
 * @param isSecret  When `true` the value is stored in the OS keychain
 *                  instead of SQLite.
 */
export async function saveSetting(key: string, value: string, isSecret = false): Promise<void> {
  return withTimeout(invoke<undefined>("save_setting", { key, value, isSecret }));
}

/**
 * Reads a single setting from the appropriate store.
 *
 * @returns The stored value, or `null` when the key does not exist.
 */
export async function getSetting(key: string, isSecret = false): Promise<string | null> {
  const result = await withTimeout(invoke<string | null>("get_setting", { key, isSecret }));
  return result ?? null;
}

/**
 * Fetches multiple secret settings in a single IPC call.
 *
 * @returns A map of key → value for all requested keys that exist in the
 *          keychain.  Keys that are not found are omitted.
 */
export async function getSecrets(keys: string[]): Promise<Record<string, string>> {
  return withTimeout(invoke<Record<string, string>>("get_secrets", { keys }));
}

/**
 * Preload all known secrets into the backend in-memory cache.
 * Call once at app startup so the OS keychain password prompt only appears
 * at launch. Uses a longer timeout (60s) for cold keychain access.
 */
export async function preloadSecrets(): Promise<void> {
  return withTimeout(invoke<undefined>("preload_secrets"), 60000);
}

/**
 * Deletes a setting from the appropriate store.
 */
export async function deleteSetting(key: string, isSecret = false): Promise<void> {
  return withTimeout(invoke<undefined>("delete_setting", { key, isSecret }));
}

/**
 * Factory-reset all global settings.
 *
 * Deletes every keychain secret in the canonical secret-key list, resets
 * `~/.LiteDuck/config.json` to defaults, truncates the SQLite `settings`
 * table, and wipes the in-memory secret cache.
 *
 * Workspace-scoped data (`<ws>/.LiteDuck/scrum`, `agents`, `chat`,
 * `automations`, `mcp`) and chat history are NOT affected.
 *
 * Requires biometric authentication on the backend; rejects with an
 * "Biometric authentication required" error if the gate is locked.
 */
export async function resetAllSettings(): Promise<void> {
  return withTimeout(invoke<undefined>("reset_all_settings"));
}
