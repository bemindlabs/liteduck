import { invoke } from "@tauri-apps/api/core";

export interface BiometricStatus {
  available: boolean;
  biometry_type: string;
}

/** Check if biometric authentication is available and what type it is. */
export async function biometricStatus(): Promise<BiometricStatus> {
  return invoke<BiometricStatus>("biometric_status");
}

/** Prompt the user for biometric authentication. Rejects on failure/cancel. */
export async function biometricAuthenticate(reason = "Unlock keychain secrets"): Promise<void> {
  return invoke<undefined>("biometric_authenticate", { reason });
}

/** Sync biometric gate state to the backend so it can enforce secret access. */
export async function biometricSetGate(enabled: boolean, unlocked: boolean): Promise<void> {
  return invoke<undefined>("biometric_set_gate", { enabled, unlocked });
}
