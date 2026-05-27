//! Desktop implementation of the [`SecretStore`] trait using the OS keychain.
//!
//! [`KeyringSecretStore`] wraps the `keyring` crate, which delegates to
//! macOS Keychain, Windows Credential Manager, or the Linux secret-service.

use keyring::Entry;
use liteduck_core::{traits::SecretStore, LiteduckError};

const SERVICE: &str = "com.bemindlabs.liteduck";

/// Implements [`SecretStore`] via the OS-provided keychain.
pub struct KeyringSecretStore;

impl KeyringSecretStore {
    pub fn new() -> Self {
        Self
    }

    fn entry(key: &str) -> Result<Entry, LiteduckError> {
        Entry::new(SERVICE, key).map_err(|e| LiteduckError::from(format!("keyring entry: {e}")))
    }
}

impl Default for KeyringSecretStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretStore for KeyringSecretStore {
    fn get(&self, key: String) -> Result<Option<String>, LiteduckError> {
        match Self::entry(&key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(LiteduckError::from(format!("keyring get: {e}"))),
        }
    }

    fn set(&self, key: String, value: String) -> Result<(), LiteduckError> {
        Self::entry(&key)?
            .set_password(&value)
            .map_err(|e| LiteduckError::from(format!("keyring set: {e}")))
    }

    fn delete(&self, key: String) -> Result<(), LiteduckError> {
        match Self::entry(&key)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(LiteduckError::from(format!("keyring delete: {e}"))),
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Returns `true` when the OS keychain is reachable.
    /// On Linux CI there is no D-Bus secrets service, so tests gracefully skip.
    fn keychain_available() -> bool {
        KeyringSecretStore::new()
            .set("__probe__".to_string(), "ok".to_string())
            .is_ok()
    }

    #[test]
    fn set_get_delete_roundtrip() {
        if !keychain_available() {
            eprintln!("keychain unavailable — skipping");
            return;
        }
        let store = KeyringSecretStore::new();
        let key = "__liteduck_ks_test__".to_string();

        store.set(key.clone(), "s3cr3t".to_string()).unwrap();
        assert_eq!(store.get(key.clone()).unwrap(), Some("s3cr3t".to_string()));

        store.delete(key.clone()).unwrap();
        assert_eq!(store.get(key).unwrap(), None);
    }

    #[test]
    fn get_missing_returns_none() {
        if !keychain_available() {
            eprintln!("keychain unavailable — skipping");
            return;
        }
        let store = KeyringSecretStore::new();
        let key = "__liteduck_ks_missing__".to_string();
        let _ = store.delete(key.clone());
        assert_eq!(store.get(key).unwrap(), None);
    }

    #[test]
    fn delete_nonexistent_is_ok() {
        if !keychain_available() {
            eprintln!("keychain unavailable — skipping");
            return;
        }
        let store = KeyringSecretStore::new();
        assert!(store
            .delete("__liteduck_ks_nonexistent__".to_string())
            .is_ok());
    }
}
