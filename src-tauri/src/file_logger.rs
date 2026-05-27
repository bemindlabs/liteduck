//! Dual-output logger: writes to both stderr and a rotating log file.
//!
//! Log file lives at `<data_dir>/liteduck.log`. On startup, if the existing
//! file exceeds `MAX_LOG_BYTES`, it is rotated to `liteduck.log.1` (keeping
//! only one generation).

use log::{Level, LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

/// Max log file size before rotation (~2 MB).
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

struct DualLogger {
    file: Mutex<Option<File>>,
}

impl Log for DualLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let level = record.level();
        let target = record.target();
        let msg = record.args();

        // stderr (coloured by level)
        eprintln!("{now} [{level}] {target}: {msg}");

        // file
        if let Ok(mut guard) = self.file.lock() {
            if let Some(ref mut f) = *guard {
                let _ = writeln!(f, "{now} [{level}] {target}: {msg}");
            }
        }
    }

    fn flush(&self) {
        if let Ok(mut guard) = self.file.lock() {
            if let Some(ref mut f) = *guard {
                let _ = f.flush();
            }
        }
    }
}

/// Rotate `liteduck.log` → `liteduck.log.1` if over size limit.
fn maybe_rotate(path: &Path) {
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > MAX_LOG_BYTES {
            let rotated = path.with_extension("log.1");
            // Remove existing rotated log so rename doesn't fail
            let _ = fs::remove_file(&rotated);
            let _ = fs::rename(path, rotated);
        }
    }
}

/// Initialise the dual logger. Call once at startup.
pub fn init(data_dir: &Path) {
    let log_path = data_dir.join("liteduck.log");
    maybe_rotate(&log_path);

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();

    let logger = DualLogger {
        file: Mutex::new(file),
    };

    // Box::leak is fine — logger lives for the entire process.
    let _ = log::set_logger(Box::leak(Box::new(logger)));
    log::set_max_level(LevelFilter::Info);
}
