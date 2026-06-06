use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Build the native application menu bar.
///
/// Navigate mirrors the sidebar where applicable:
///   LiteDuck  |  File  |  Navigate  |  View  |  Window  |  Help
pub fn build_menu(app: &AppHandle<Wry>) -> Result<tauri::menu::Menu<Wry>, tauri::Error> {
    // ── LiteDuck (app) menu ──────────────────────────────────────────────────
    let about = MenuItemBuilder::with_id("about", "About LiteDuck").build(app)?;
    let settings = MenuItemBuilder::with_id("nav_settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit LiteDuck")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "LiteDuck")
        .item(&about)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    // ── File menu ────────────────────────────────────────────────────────────
    let new_window = MenuItemBuilder::with_id("new_window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let new_window_pick =
        MenuItemBuilder::with_id("new_window_pick", "New Window with Workspace...").build(app)?;
    let new_terminal = MenuItemBuilder::with_id("new_terminal", "New Terminal Tab")
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("close_tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    // Close All Tabs uses Cmd+Alt+W — VS Code's Cmd+K Cmd+W chord can't be
    // expressed as a single accelerator, and Cmd+Shift+W is Close Window.
    let close_all_tabs = MenuItemBuilder::with_id("close_all_tabs", "Close All Tabs")
        .accelerator("CmdOrCtrl+Alt+W")
        .build(app)?;
    let reopen_closed_tab = MenuItemBuilder::with_id("reopen_closed_tab", "Reopen Closed Tab")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;
    let close_window = MenuItemBuilder::with_id("close_window", "Close Window")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .item(&new_window_pick)
        .separator()
        .item(&new_terminal)
        .item(&close_tab)
        .item(&close_all_tabs)
        .item(&reopen_closed_tab)
        .separator()
        .item(&close_window)
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
    // No accelerator: Cmd+Shift+T is now Reopen Closed Tab (VS Code parity).
    // "Go to Terminal" remains reachable via Cmd+1 (webview shortcut).
    let nav_terminal = MenuItemBuilder::with_id("nav_terminal", "Terminal").build(app)?;

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

/// Return the label of the currently-focused webview window, falling back
/// to `"main"` when none is focused (e.g. menu hit during a transient
/// focus loss).
fn focused_label(app: &AppHandle<Wry>) -> String {
    for (label, win) in app.webview_windows() {
        if win.is_focused().unwrap_or(false) {
            return label;
        }
    }
    "main".to_string()
}

/// Emit a `menu-action` event to the focused window only.
///
/// Broadcasting (`app.emit(...)`) sent Cmd+T to every open window — fine
/// before multi-window, a real bug after.
fn emit_action_focused(app: &AppHandle<Wry>, action: &str) {
    let label = focused_label(app);
    let _ = app.emit_to(label.as_str(), "menu-action", action);
}

/// Emit a `menu-navigate` event to the focused window only.
fn emit_navigate_focused(app: &AppHandle<Wry>, route: &str) {
    let label = focused_label(app);
    let _ = app.emit_to(label.as_str(), "menu-navigate", route);
}

/// Handle a menu event by emitting a frontend event for navigation / actions.
pub fn handle_menu_event(app: &AppHandle<Wry>, event_id: &str) {
    match event_id {
        // ── App menu ─────────────────────────────────────────────────────────
        "about" => {
            emit_action_focused(app, "about");
        }
        "quit" => {
            app.exit(0);
        }

        // ── File menu ────────────────────────────────────────────────────────
        "new_window" => {
            // Clone the focused window's workspace into a new window. The
            // frontend hands us the workspace path via the `menu-action`
            // event payload roundtrip, but the simpler model is to let the
            // frontend invoke `window_open(currentWorkspace)` itself when it
            // receives the `new_window` action — keeps the backend stateless
            // about which workspace the focused window currently shows.
            emit_action_focused(app, "new_window");
        }
        "new_window_pick" => {
            // Open with no workspace pre-selected — the frontend lands on
            // `/landing` so the user can pick a workspace (recent / browse).
            emit_action_focused(app, "new_window_pick");
        }
        "new_terminal" => {
            emit_action_focused(app, "new_terminal");
        }
        "close_tab" => {
            emit_action_focused(app, "close_tab");
        }
        "close_all_tabs" => {
            emit_action_focused(app, "close_all_tabs");
        }
        "reopen_closed_tab" => {
            emit_action_focused(app, "reopen_closed_tab");
        }
        "close_window" => {
            let label = focused_label(app);
            if let Some(win) = app.get_webview_window(&label) {
                let _ = win.close();
            }
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
            emit_navigate_focused(app, route);
        }

        // ── View menu ────────────────────────────────────────────────────────
        "toggle_sidebar" => {
            emit_action_focused(app, "toggle_sidebar");
        }
        "command_palette" => {
            emit_action_focused(app, "command_palette");
        }
        "toggle_dark" => {
            emit_action_focused(app, "toggle_dark");
        }
        "toggle_focus" => {
            emit_action_focused(app, "toggle_focus");
        }

        // ── Window menu ──────────────────────────────────────────────────────
        "minimize" => {
            emit_action_focused(app, "minimize");
        }
        "zoom" => {
            emit_action_focused(app, "zoom");
        }
        "fullscreen" => {
            emit_action_focused(app, "fullscreen");
        }

        // ── Help menu ────────────────────────────────────────────────────────
        "shortcuts_help" => {
            emit_action_focused(app, "shortcuts_help");
        }
        "website" => {
            let _ = tauri_plugin_opener::open_url(
                "https://buildonclaw.cloud/products/liteduck",
                None::<&str>,
            );
        }
        "release_notes" => {
            let _ = tauri_plugin_opener::open_url(
                "https://github.com/bemindlabs/liteduck/releases",
                None::<&str>,
            );
        }
        "report_issue" => {
            let _ = tauri_plugin_opener::open_url(
                "https://github.com/bemindlabs/liteduck/issues",
                None::<&str>,
            );
        }

        _ => {}
    }
}
