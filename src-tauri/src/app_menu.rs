use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Wry};

/// Build the native application menu bar.
///
/// Navigate mirrors the sidebar where applicable:
///   LiteDuck  |  File  |  Navigate  |  View  |  Window  |  Help
pub fn build_menu(app: &AppHandle<Wry>) -> Result<tauri::menu::Menu<Wry>, tauri::Error> {
    // ── LiteDuck (app) menu ──────────────────────────────────────────────────
    let about = MenuItemBuilder::with_id("about", "About LiteDuck").build(app)?;
    let check_update =
        MenuItemBuilder::with_id("check_update", "Check for Updates...").build(app)?;
    let settings = MenuItemBuilder::with_id("nav_settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit LiteDuck")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "LiteDuck")
        .item(&about)
        .item(&check_update)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    // ── File menu ────────────────────────────────────────────────────────────
    let new_terminal = MenuItemBuilder::with_id("new_terminal", "New Terminal Tab")
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("close_tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_terminal)
        .item(&close_tab)
        .build()?;

    // ── Edit menu (native predefined items for clipboard/undo) ─────────────
    // Using PredefinedMenuItem connects directly to the native macOS selectors
    // (copy:, paste:, etc.) so Cmd+C / Cmd+V work in the WebView without
    // needing JavaScript bridges.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // ── Navigate menu ────────────────────────────────────────────────────────
    // Development
    let nav_files = MenuItemBuilder::with_id("nav_files", "Files")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;
    let nav_terminal = MenuItemBuilder::with_id("nav_terminal", "Terminal")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;

    // Source Control
    let nav_git = MenuItemBuilder::with_id("nav_git", "Git")
        .accelerator("CmdOrCtrl+Shift+G")
        .build(app)?;

    // Utility
    let nav_notifications =
        MenuItemBuilder::with_id("nav_notifications", "Notifications").build(app)?;

    let dev_submenu = SubmenuBuilder::new(app, "Development")
        .item(&nav_terminal)
        .item(&nav_files)
        .build()?;

    let source_submenu = SubmenuBuilder::new(app, "Source Control")
        .item(&nav_git)
        .build()?;

    let navigate_menu = SubmenuBuilder::new(app, "Navigate")
        .item(&dev_submenu)
        .item(&source_submenu)
        .separator()
        .item(&nav_notifications)
        .item(&settings)
        .build()?;

    // ── View menu ────────────────────────────────────────────────────────────
    let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;
    let command_palette = MenuItemBuilder::with_id("command_palette", "Command Palette...")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let toggle_dark = MenuItemBuilder::with_id("toggle_dark", "Toggle Dark Mode").build(app)?;
    let toggle_focus = MenuItemBuilder::with_id("toggle_focus", "Toggle Focus Mode")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_sidebar)
        .item(&command_palette)
        .separator()
        .item(&toggle_dark)
        .item(&toggle_focus)
        .build()?;

    // ── Window menu ──────────────────────────────────────────────────────────
    let minimize = MenuItemBuilder::with_id("minimize", "Minimize")
        .accelerator("CmdOrCtrl+M")
        .build(app)?;
    let zoom = MenuItemBuilder::with_id("zoom", "Zoom").build(app)?;
    let fullscreen = MenuItemBuilder::with_id("fullscreen", "Toggle Full Screen")
        .accelerator("Ctrl+CmdOrCtrl+F")
        .build(app)?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&minimize)
        .item(&zoom)
        .item(&fullscreen)
        .build()?;

    // ── Help menu ────────────────────────────────────────────────────────────
    let shortcuts_help = MenuItemBuilder::with_id("shortcuts_help", "Keyboard Shortcuts")
        .accelerator("CmdOrCtrl+Shift+/")
        .build(app)?;
    let website = MenuItemBuilder::with_id("website", "LiteDuck Website").build(app)?;
    let release_notes = MenuItemBuilder::with_id("release_notes", "Release Notes").build(app)?;
    let report_issue = MenuItemBuilder::with_id("report_issue", "Report Issue...").build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&shortcuts_help)
        .separator()
        .item(&website)
        .item(&release_notes)
        .item(&report_issue)
        .build()?;

    // ── Assemble menu bar ────────────────────────────────────────────────────
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&navigate_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

/// Handle a menu event by emitting a frontend event for navigation / actions.
pub fn handle_menu_event(app: &AppHandle<Wry>, event_id: &str) {
    match event_id {
        // ── App menu ─────────────────────────────────────────────────────────
        "about" => {
            let _ = app.emit("menu-action", "about");
        }
        "check_update" => {
            let _ = app.emit("menu-action", "check_update");
        }
        "quit" => {
            app.exit(0);
        }

        // ── File menu ────────────────────────────────────────────────────────
        "new_terminal" => {
            let _ = app.emit("menu-action", "new_terminal");
        }
        "close_tab" => {
            let _ = app.emit("menu-action", "close_tab");
        }

        // Edit menu items are PredefinedMenuItems — they are handled natively
        // by the macOS responder chain (no event handler needed).

        // ── Navigate menu ────────────────────────────────────────────────────
        id if id.starts_with("nav_") => {
            let route = match id {
                "nav_files" => "/files",
                "nav_terminal" => "/terminal",
                "nav_git" => "/git",
                "nav_notifications" => "/notifications",
                "nav_settings" => "/settings",
                _ => return,
            };
            let _ = app.emit("menu-navigate", route);
        }

        // ── View menu ────────────────────────────────────────────────────────
        "toggle_sidebar" => {
            let _ = app.emit("menu-action", "toggle_sidebar");
        }
        "command_palette" => {
            let _ = app.emit("menu-action", "command_palette");
        }
        "toggle_dark" => {
            let _ = app.emit("menu-action", "toggle_dark");
        }
        "toggle_focus" => {
            let _ = app.emit("menu-action", "toggle_focus");
        }

        // ── Window menu ──────────────────────────────────────────────────────
        "minimize" => {
            let _ = app.emit("menu-action", "minimize");
        }
        "zoom" => {
            let _ = app.emit("menu-action", "zoom");
        }
        "fullscreen" => {
            let _ = app.emit("menu-action", "fullscreen");
        }

        // ── Help menu ────────────────────────────────────────────────────────
        "shortcuts_help" => {
            let _ = app.emit("menu-action", "shortcuts_help");
        }
        "website" => {
            let _ = tauri_plugin_opener::open_url(
                "https://buildonclaw.cloud/products/liteduck",
                None::<&str>,
            );
        }
        "release_notes" => {
            let _ = tauri_plugin_opener::open_url(
                "https://github.com/bemindlabs/liteduck-releases/releases",
                None::<&str>,
            );
        }
        "report_issue" => {
            let _ = tauri_plugin_opener::open_url(
                "https://github.com/bemindlabs/liteduck-releases/issues",
                None::<&str>,
            );
        }

        _ => {}
    }
}
