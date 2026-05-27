//! Device identity — unique device ID and cryptographic secret.
//!
//! Platform-independent: all functions take a `data_dir` path.
//! The Tauri layer resolves this via `AppHandle`; mobile layers use their
//! own platform-specific data directories.

use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, uniffi::Record)]
pub struct DeviceIdentity {
    pub device_id: String,
    /// 32-byte random secret, hex-encoded.  Used as a stable HMAC key when
    /// signing connect handshakes for the OpenClaw gateway.
    pub secret: String,
    pub created_at: String,
}

// ── Internal helpers ─────────────────────────────────────────────────────────

fn identity_path(data_dir: &str) -> std::path::PathBuf {
    Path::new(data_dir).join("device-identity.json")
}

fn generate() -> DeviceIdentity {
    let device_id = Uuid::new_v4().to_string();

    let secret_bytes: [u8; 32] = {
        let mut bytes = [0u8; 32];
        let (lo, hi) = bytes.split_at_mut(16);
        lo.copy_from_slice(Uuid::new_v4().as_bytes());
        hi.copy_from_slice(Uuid::new_v4().as_bytes());
        bytes
    };

    let secret = hex::encode(secret_bytes);
    let created_at = chrono::Utc::now().to_rfc3339();

    DeviceIdentity {
        device_id,
        secret,
        created_at,
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Loads the persisted device identity from `<data_dir>/device-identity.json`.
/// If the file does not exist, or is corrupt, a fresh identity is generated and
/// persisted before being returned.
pub fn load_or_create_identity(data_dir: &str) -> Result<DeviceIdentity, String> {
    let path = identity_path(data_dir);

    if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("read identity file: {e}"))?;
        match serde_json::from_str::<DeviceIdentity>(&raw) {
            Ok(identity) => return Ok(identity),
            Err(e) => {
                log::warn!("Corrupt identity file, regenerating: {e}");
            }
        }
    }

    let identity = generate();
    persist(&identity, data_dir)?;
    Ok(identity)
}

/// Replaces the persisted identity with a freshly generated one.
pub fn reset_identity(data_dir: &str) -> Result<DeviceIdentity, String> {
    let identity = generate();
    persist(&identity, data_dir)?;
    Ok(identity)
}

fn persist(identity: &DeviceIdentity, data_dir: &str) -> Result<(), String> {
    let path = identity_path(data_dir);
    let json =
        serde_json::to_string_pretty(identity).map_err(|e| format!("serialize identity: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("write identity file: {e}"))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_device_id_is_valid_uuid() {
        let id = generate();
        let parts: Vec<&str> = id.device_id.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert!(id
            .device_id
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-'));
    }

    #[test]
    fn generate_secret_is_64_char_hex() {
        let id = generate();
        assert_eq!(id.secret.len(), 64);
        assert!(id.secret.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generate_produces_unique_ids() {
        let a = generate();
        let b = generate();
        assert_ne!(a.device_id, b.device_id);
        assert_ne!(a.secret, b.secret);
    }

    #[test]
    fn load_or_create_creates_when_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_dir = dir.path().to_str().unwrap();
        let id = load_or_create_identity(data_dir).expect("should succeed");
        assert!(!id.device_id.is_empty());
        assert!(dir.path().join("device-identity.json").exists());
    }

    #[test]
    fn load_or_create_returns_consistent_identity() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_dir = dir.path().to_str().unwrap();
        let first = load_or_create_identity(data_dir).unwrap();
        let second = load_or_create_identity(data_dir).unwrap();
        assert_eq!(first.device_id, second.device_id);
        assert_eq!(first.secret, second.secret);
    }

    #[test]
    fn load_or_create_regenerates_on_corrupt_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_dir = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("device-identity.json"), b"not json").unwrap();
        let id = load_or_create_identity(data_dir).expect("should recover");
        assert!(!id.device_id.is_empty());
    }

    #[test]
    fn reset_identity_replaces_existing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_dir = dir.path().to_str().unwrap();
        let original = load_or_create_identity(data_dir).unwrap();
        let reset = reset_identity(data_dir).unwrap();
        assert_ne!(original.device_id, reset.device_id);
        let loaded = load_or_create_identity(data_dir).unwrap();
        assert_eq!(loaded.device_id, reset.device_id);
    }
}
