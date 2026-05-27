//! Platform abstraction traits.
//!
//! These traits decouple core business logic from platform-specific mechanisms
//! (Tauri event emission, OS keychain, etc.) so the same logic can run on
//! desktop, iOS, and Android.
//!
//! Signatures use owned `String` args and `LiteduckError` to match the UniFFI
//! callback interface generated from `liteduck_core.udl`.

use crate::LiteduckError;

/// Emits events to the frontend (or native UI layer).
///
/// Desktop: implemented via `tauri::Emitter` (`window.emit()`).
/// Mobile: implemented via native callbacks (Swift closures / Kotlin lambdas).
pub trait EventSink: Send + Sync {
    fn emit(&self, event: String, payload: String) -> Result<(), LiteduckError>;
}

/// Stores and retrieves secrets in the OS-provided secure storage.
///
/// Desktop: `keyring` crate (macOS Keychain, Windows Credential Manager, Linux secret-service).
/// iOS: Keychain Services via Security framework.
/// Android: EncryptedSharedPreferences / Android Keystore.
pub trait SecretStore: Send + Sync {
    fn get(&self, key: String) -> Result<Option<String>, LiteduckError>;
    fn set(&self, key: String, value: String) -> Result<(), LiteduckError>;
    fn delete(&self, key: String) -> Result<(), LiteduckError>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    // ── In-memory EventSink ───────────────────────────────────────────────────

    struct MockEventSink {
        events: Arc<Mutex<Vec<(String, String)>>>,
    }

    impl MockEventSink {
        fn new() -> Self {
            Self {
                events: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn recorded(&self) -> Vec<(String, String)> {
            self.events.lock().unwrap().clone()
        }
    }

    impl EventSink for MockEventSink {
        fn emit(&self, event: String, payload: String) -> Result<(), LiteduckError> {
            self.events.lock().unwrap().push((event, payload));
            Ok(())
        }
    }

    // Compile-time check: both traits must satisfy Send + Sync.
    fn _assert_send_sync<T: Send + Sync>() {}
    fn _check_mock() {
        _assert_send_sync::<MockEventSink>();
    }

    #[test]
    fn event_sink_records_emitted_events() {
        let sink = MockEventSink::new();
        sink.emit("build.started".into(), r#"{"id":1}"#.into())
            .unwrap();
        sink.emit("build.done".into(), r#"{"id":1,"ok":true}"#.into())
            .unwrap();
        let events = sink.recorded();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].0, "build.started");
        assert_eq!(events[1].0, "build.done");
    }

    #[test]
    fn event_sink_empty_payload_is_accepted() {
        let sink = MockEventSink::new();
        sink.emit("ping".into(), String::new()).unwrap();
        assert_eq!(sink.recorded()[0].1, "");
    }

    // ── In-memory SecretStore ─────────────────────────────────────────────────

    struct MemSecretStore(Arc<Mutex<HashMap<String, String>>>);

    impl MemSecretStore {
        fn new() -> Self {
            Self(Arc::new(Mutex::new(HashMap::new())))
        }
    }

    impl SecretStore for MemSecretStore {
        fn get(&self, key: String) -> Result<Option<String>, LiteduckError> {
            Ok(self.0.lock().unwrap().get(&key).cloned())
        }
        fn set(&self, key: String, value: String) -> Result<(), LiteduckError> {
            self.0.lock().unwrap().insert(key, value);
            Ok(())
        }
        fn delete(&self, key: String) -> Result<(), LiteduckError> {
            self.0.lock().unwrap().remove(&key);
            Ok(())
        }
    }

    fn _check_mem_store() {
        _assert_send_sync::<MemSecretStore>();
    }

    #[test]
    fn secret_store_get_missing_returns_none() {
        let store = MemSecretStore::new();
        assert_eq!(store.get("nope".into()).unwrap(), None);
    }

    #[test]
    fn secret_store_set_get_roundtrip() {
        let store = MemSecretStore::new();
        store.set("token".into(), "abc123".into()).unwrap();
        assert_eq!(store.get("token".into()).unwrap(), Some("abc123".into()));
    }

    #[test]
    fn secret_store_overwrite_replaces_value() {
        let store = MemSecretStore::new();
        store.set("k".into(), "v1".into()).unwrap();
        store.set("k".into(), "v2".into()).unwrap();
        assert_eq!(store.get("k".into()).unwrap(), Some("v2".into()));
    }

    #[test]
    fn secret_store_delete_removes_key() {
        let store = MemSecretStore::new();
        store.set("k".into(), "v".into()).unwrap();
        store.delete("k".into()).unwrap();
        assert_eq!(store.get("k".into()).unwrap(), None);
    }

    #[test]
    fn secret_store_delete_missing_is_ok() {
        let store = MemSecretStore::new();
        assert!(store.delete("never_set".into()).is_ok());
    }
}
