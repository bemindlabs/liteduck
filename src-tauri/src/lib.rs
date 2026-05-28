#![allow(clippy::too_many_arguments)]

pub mod agent_memory;
#[cfg(not(target_os = "ios"))]
pub mod app_menu;
pub mod bash_validator;
pub mod biometric;
pub mod db;
pub mod device_identity;
pub mod event_sink;
mod file_logger;
#[cfg(not(target_os = "ios"))]
pub mod files;
#[cfg(not(target_os = "ios"))]
pub mod git;
pub mod home;
pub mod keychain;
pub mod keyring_store;
#[cfg(not(target_os = "ios"))]
pub mod plugins;
#[cfg(not(target_os = "ios"))]
pub mod pty;
pub mod settings;
#[cfg(not(target_os = "ios"))]
pub mod terminal;
#[cfg(not(target_os = "ios"))]
pub mod updater;
pub mod workspace;

// ── Shared test utilities ─────────────────────────────────────────────────────

/// A single process-wide mutex that all test modules acquire before reading or
/// writing the `LITEDUCK_HOME` environment variable.  Using one mutex (rather
/// than a per-module one) prevents races between tests in different modules
/// (e.g. `home::tests` vs `workspace::tests`) that all run in the same process.
#[cfg(test)]
pub mod test_env {
    use std::sync::Mutex;
    pub static ENV_LOCK: Mutex<()> = Mutex::new(());
}

// ── Legacy greet command ──────────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ── Application entry point ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // rustls 0.23 needs an explicit default crypto provider so the first TLS
    // handshake (reqwest, used by the updater) doesn't panic on a worker thread.
    //
    // install_default() in rustls 0.23 only returns Err when a provider is already
    // installed (e.g. dev hot-reload re-running `run()`). We treat that as a benign
    // no-op.
    match rustls::crypto::aws_lc_rs::default_provider().install_default() {
        Ok(()) => {}
        Err(_already_installed) => {
            eprintln!("rustls: default CryptoProvider was already installed — continuing");
        }
    }

    use log::info;

    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.bemindlabs.liteduck");

    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("Failed to create data directory: {e}");
    }

    file_logger::init(&data_dir);

    info!("LiteDuck starting up");
    info!("Data directory: {}", data_dir.display());

    // settings.db is opened lazily on first use via db::get_conn() (OnceLock).

    // Build the Tauri application. Some builder methods (set_menu, on_menu_event)
    // and state items (PtyManager) are desktop-only and must be conditionally
    // applied for iOS targets.
    let builder = tauri::Builder::default().setup(|app| {
        use tauri::Manager;

        // iOS: disable WKWebView scroll view automatic safe area inset adjustment
        // so the WebView content fills edge-to-edge (no bottom gap).
        #[cfg(target_os = "ios")]
        {
            if let Some(wv_window) = app.get_webview_window("main") {
                let _ = wv_window.with_webview(move |platform_webview| {
                    let wk_webview = platform_webview.inner();
                    unsafe {
                        use std::ffi::c_void;
                        // Register selectors via Objective-C runtime
                        let sel_scroll = objc2::runtime::Sel::register(c"scrollView");
                        let sel_inset =
                            objc2::runtime::Sel::register(c"setContentInsetAdjustmentBehavior:");

                        // [wkWebView scrollView]
                        let msg: unsafe extern "C" fn(
                            *mut c_void,
                            objc2::runtime::Sel,
                        ) -> *mut c_void =
                            std::mem::transmute(objc2::ffi::objc_msgSend as *const ());
                        let scroll_view = msg(wk_webview, sel_scroll);

                        if !scroll_view.is_null() {
                            // [scrollView setContentInsetAdjustmentBehavior: 2]
                            // 2 = UIScrollViewContentInsetAdjustmentNever
                            let msg_int: unsafe extern "C" fn(
                                *mut c_void,
                                objc2::runtime::Sel,
                                isize,
                            ) = std::mem::transmute(objc2::ffi::objc_msgSend as *const ());
                            msg_int(scroll_view, sel_inset, 2);
                        }
                    }
                });
            }
        }

        // Build and set the native application menu (desktop only).
        #[cfg(not(target_os = "ios"))]
        {
            let handle = app.handle().clone();
            match app_menu::build_menu(&handle) {
                Ok(menu) => {
                    let _ = app.set_menu(menu);
                }
                Err(e) => {
                    log::error!("Failed to build application menu: {e}");
                }
            }
        }

        #[cfg(not(target_os = "ios"))]
        app.manage(std::sync::Arc::new(pty::PtyManager::new()));

        // Wire TauriEventSink into managed state.
        if let Some(window) = app.get_webview_window("main") {
            let sink: std::sync::Arc<dyn liteduck_core::traits::EventSink> =
                std::sync::Arc::new(event_sink::TauriEventSink(window));
            app.manage(sink);
        } else {
            log::warn!("setup: 'main' window not found — TauriEventSink not registered");
        }

        // set_title is desktop-only — skip on iOS.
        #[cfg(all(debug_assertions, not(target_os = "ios")))]
        {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("LiteDuck (DEV)");
            }
        }

        Ok(())
    });

    // on_menu_event is a desktop-only builder method; it does not exist on iOS.
    #[cfg(not(target_os = "ios"))]
    let builder = builder.on_menu_event(|app, event| {
        app_menu::handle_menu_event(app, event.id().as_ref());
    });

    // Register common managed state (works on all platforms).
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage({
            let store: std::sync::Arc<dyn liteduck_core::traits::SecretStore> =
                std::sync::Arc::new(keyring_store::KeyringSecretStore::new());
            store
        })
        .manage(biometric::BiometricGateState::new());

    // Build the platform-specific invoke handler.
    //
    // `tauri::generate_handler![]` is a macro that must receive all command
    // symbols at compile time, so we cannot use `#[cfg]` inside a single
    // invocation. Two complete terminal chains are declared below — one per
    // target — each calling `.invoke_handler(tauri::generate_handler![...]).run()`
    // directly.

    // ── Desktop handler (macOS / Windows / Linux) ─────────────────────────────
    #[cfg(not(target_os = "ios"))]
    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            // Settings
            settings::get_settings,
            settings::save_setting,
            settings::get_setting,
            settings::get_secrets,
            settings::preload_secrets,
            settings::delete_setting,
            settings::reset_all_settings,
            // Terminal / PTY — desktop only (portable-pty / ioctl-rs)
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_list,
            // Files — desktop only (opens VSCode, etc.)
            files::files_list_dir,
            files::files_read_text,
            files::files_write_text,
            files::files_open_in_vscode,
            files::files_get_metadata,
            files::files_rename,
            files::files_create_dir,
            files::files_delete,
            // Git — desktop only (git2 / libgit2)
            git::git_status,
            git::git_log,
            git::git_diff_working,
            git::git_diff_commit,
            git::git_current_branch,
            git::git_list_branches,
            // Git worktrees — desktop only
            git::git_worktree_list,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_worktree_prune,
            git::git_init,
            git::git_scan_repos,
            // Device identity
            device_identity::device_get_identity,
            device_identity::device_reset_identity,
            // Biometric
            biometric::biometric_status,
            biometric::biometric_authenticate,
            biometric::biometric_set_gate,
            // Update checker — desktop only
            updater::check_for_update,
            updater::download_update,
            updater::install_update,
            updater::get_app_version,
            // Workspace initialization
            workspace::path_exists,
            workspace::workspace_init,
            workspace::workspace_check_templates,
            workspace::workspace_init_template,
            workspace::workspace_scaffold,
            // Home directory (~/.liteduck)
            home::home_dir_path,
            home::home_ensure,
            home::home_profile_read,
            home::home_profile_write,
            home::home_config_read,
            home::home_config_write,
            home::home_resolve_config,
            // Workspace registry (~/.liteduck/workspaces.json)
            home::home_workspaces_list,
            home::home_workspaces_update,
            // Global cross-workspace memory notes (~/.liteduck/memory/)
            home::home_memory_list,
            home::home_memory_read,
            home::home_memory_write,
            home::home_memory_delete,
            home::home_memory_search,
            // Migration wizard: SQLite → ~/.liteduck JSON
            home::home_migration_check,
            home::home_migration_run,
            // Template resolution (~/.liteduck/templates/workspace/)
            workspace::home_templates_list,
            // Plugin system (Hybrid manifest + shell — desktop only).
            // Integrations (e.g. BWOC, Jira) live here as opt-in plugins, never
            // in core — see resources/plugins/.
            plugins::plugin_list,
            plugins::plugin_list,
            plugins::plugin_install,
            plugins::plugin_uninstall,
            plugins::plugin_run_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // ── iOS handler ───────────────────────────────────────────────────────────
    // Excludes commands that depend on desktop-only native libraries
    // (portable-pty, git2, etc.).
    #[cfg(target_os = "ios")]
    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            // Settings
            settings::get_settings,
            settings::save_setting,
            settings::get_setting,
            settings::get_secrets,
            settings::preload_secrets,
            settings::delete_setting,
            settings::reset_all_settings,
            // Device identity
            device_identity::device_get_identity,
            device_identity::device_reset_identity,
            // Biometric
            biometric::biometric_status,
            biometric::biometric_authenticate,
            biometric::biometric_set_gate,
            // Workspace initialization
            workspace::path_exists,
            workspace::workspace_init,
            workspace::workspace_check_templates,
            workspace::workspace_init_template,
            workspace::workspace_scaffold,
            // Home directory (~/.liteduck)
            home::home_dir_path,
            home::home_ensure,
            home::home_profile_read,
            home::home_profile_write,
            home::home_config_read,
            home::home_config_write,
            home::home_resolve_config,
            home::home_workspaces_list,
            home::home_workspaces_update,
            home::home_memory_list,
            home::home_memory_read,
            home::home_memory_write,
            home::home_memory_delete,
            home::home_memory_search,
            home::home_migration_check,
            home::home_migration_run,
            workspace::home_templates_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
