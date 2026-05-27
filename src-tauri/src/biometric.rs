//! Biometric authentication gate for keychain access.
//!
//! On macOS and iOS this uses the LocalAuthentication framework (Touch ID /
//! Face ID / password fallback). On other platforms the commands succeed
//! unconditionally so that the rest of the app works without modification.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Serialize)]
pub struct BiometricStatus {
    /// Whether biometric hardware is available on this machine.
    pub available: bool,
    /// Human-readable description, e.g. "Touch ID".
    pub biometry_type: String,
}

// ── Backend biometric gate state ────────────────────────────────────────────
//
// Tracks whether the user has unlocked the biometric gate this session.
// The frontend syncs this via `biometric_set_unlocked` after successful auth.
// `settings.rs` checks this before returning secrets when biometric is enabled.

pub struct BiometricGateState {
    /// Whether the user has opted in to biometric keychain protection.
    pub enabled: AtomicBool,
    /// Whether the session is currently unlocked (biometric verified).
    pub unlocked: AtomicBool,
}

impl Default for BiometricGateState {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            unlocked: AtomicBool::new(true), // unlocked until user enables biometric
        }
    }
}

impl BiometricGateState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true if secrets can be accessed (biometric disabled or session unlocked).
    pub fn can_access_secrets(&self) -> bool {
        !self.enabled.load(Ordering::SeqCst) || self.unlocked.load(Ordering::SeqCst)
    }
}

// ── macOS / iOS implementation ───────────────────────────────────────────────

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod platform {
    use super::BiometricStatus;
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Duration;

    #[link(name = "LocalAuthentication", kind = "framework")]
    extern "C" {}

    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use objc2_foundation::{NSError, NSString};

    /// Check whether biometric authentication is available.
    pub fn status() -> BiometricStatus {
        unsafe {
            let ctx: Retained<AnyObject> = msg_send![class!(LAContext), new];
            let mut error: *mut NSError = std::ptr::null_mut();
            // LAPolicyDeviceOwnerAuthenticationWithBiometrics = 1
            let available: Bool = msg_send![&ctx, canEvaluatePolicy: 1i64, error: &mut error];

            let biometry_type = if available.as_bool() {
                // LABiometryType: 0 = none, 1 = TouchID, 2 = FaceID, 3 = OpticID
                let btype: i64 = msg_send![&ctx, biometryType];
                match btype {
                    1 => "Touch ID",
                    2 => "Face ID",
                    3 => "Optic ID",
                    _ => "Biometric",
                }
            } else {
                "Unavailable"
            };

            BiometricStatus {
                available: available.as_bool(),
                biometry_type: biometry_type.to_string(),
            }
        }
    }

    /// Prompt the user for biometric authentication.
    /// Returns `Ok(())` on success, `Err(message)` on failure or cancellation.
    pub fn authenticate(reason: &str) -> Result<(), String> {
        unsafe {
            let ctx: Retained<AnyObject> = msg_send![class!(LAContext), new];
            let mut error: *mut NSError = std::ptr::null_mut();

            let available: Bool = msg_send![&ctx, canEvaluatePolicy: 1i64, error: &mut error];
            if !available.as_bool() {
                return Err("Biometric authentication is not available on this device".into());
            }

            let reason_ns = NSString::from_str(reason);

            let (tx, rx) = mpsc::channel::<Result<(), String>>();
            let tx = Arc::new(Mutex::new(Some(tx)));

            let block = block2::RcBlock::new(move |success: Bool, err: *mut NSError| {
                let result = if success.as_bool() {
                    Ok(())
                } else if err.is_null() {
                    Err("Authentication failed".to_string())
                } else {
                    let desc: Retained<NSString> = msg_send![err, localizedDescription];
                    Err(desc.to_string())
                };
                if let Some(sender) = tx.lock().unwrap().take() {
                    let _ = sender.send(result);
                }
            });

            // LAPolicyDeviceOwnerAuthenticationWithBiometrics = 1
            let _: () = msg_send![
                &ctx,
                evaluatePolicy: 1i64,
                localizedReason: &*reason_ns,
                reply: &*block
            ];

            rx.recv_timeout(Duration::from_secs(30))
                .map_err(|e| match e {
                    mpsc::RecvTimeoutError::Timeout => {
                        "Biometric authentication timed out".to_string()
                    }
                    mpsc::RecvTimeoutError::Disconnected => "Biometric channel error".to_string(),
                })?
        }
    }
}

// ── Fallback for non-Apple platforms ────────────────────────────────────────

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
mod platform {
    use super::BiometricStatus;

    pub fn status() -> BiometricStatus {
        BiometricStatus {
            available: false,
            biometry_type: "Unavailable".to_string(),
        }
    }

    pub fn authenticate(_reason: &str) -> Result<(), String> {
        // No biometric hardware — allow access unconditionally.
        Ok(())
    }
}

// ── Tauri commands ───────────────────────────────────────────────────────────

/// Returns whether biometric authentication is available and its type.
#[tauri::command]
pub fn biometric_status() -> BiometricStatus {
    platform::status()
}

/// Prompts the user for biometric authentication.
/// `reason` is shown in the system dialog (e.g. "Unlock keychain secrets").
/// The underlying platform call blocks until the user responds or the 30-second
/// timeout elapses; it is therefore offloaded to a `spawn_blocking` thread so
/// the Tauri command handler thread is never stalled.
#[tauri::command]
pub async fn biometric_authenticate(reason: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || platform::authenticate(&reason))
        .await
        .map_err(|e| format!("Biometric task error: {e}"))?
}

/// Sync the biometric gate state from the frontend.
///
/// Called by `BiometricContext` whenever the enabled/unlocked state changes
/// so that the backend can enforce the gate on secret access.
#[tauri::command]
pub fn biometric_set_gate(
    state: tauri::State<'_, BiometricGateState>,
    enabled: bool,
    unlocked: bool,
) -> Result<(), String> {
    state.enabled.store(enabled, Ordering::SeqCst);
    state.unlocked.store(unlocked, Ordering::SeqCst);
    Ok(())
}
