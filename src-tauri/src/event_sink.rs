//! Tauri-specific implementation of the [`EventSink`] trait.
//!
//! [`TauriEventSink`] wraps a [`tauri::WebviewWindow`] and forwards events through
//! Tauri's event system.  This lets business logic call `sink.emit(...)` without
//! depending directly on `tauri::Emitter`.

use liteduck_core::{traits::EventSink, LiteduckError};
use tauri::Emitter;

/// Bridges [`EventSink`] → `tauri::WebviewWindow::emit`.
pub struct TauriEventSink(pub tauri::WebviewWindow);

impl EventSink for TauriEventSink {
    fn emit(&self, event: String, payload: String) -> Result<(), LiteduckError> {
        self.0
            .emit(&event, payload)
            .map_err(|e| LiteduckError::from(format!("emit failed: {e}")))
    }
}
