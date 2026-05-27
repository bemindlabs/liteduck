import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeviceIdentity {
  /** Stable UUID that uniquely identifies this installation. */
  device_id: string;
  /** 32-byte random secret, hex-encoded. Used when signing gateway handshakes. */
  secret: string;
  /** ISO-8601 timestamp recording when the identity was first created. */
  created_at: string;
}

// ── API wrappers ──────────────────────────────────────────────────────────────

/**
 * Returns the current device identity.
 *
 * A new identity is generated and persisted on the first call (or if the
 * identity file is missing / corrupt).
 */
export async function deviceGetIdentity(): Promise<DeviceIdentity> {
  return invoke<DeviceIdentity>("device_get_identity");
}

/**
 * Regenerates the device identity and returns the new one.
 *
 * Use with caution: any gateway registrations tied to the previous device ID
 * will no longer be associated with this installation after a reset.
 */
export async function deviceResetIdentity(): Promise<DeviceIdentity> {
  return invoke<DeviceIdentity>("device_reset_identity");
}
