import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { NavigateFunction } from "react-router-dom";

interface MenuEventHandlers {
  navigate: NavigateFunction;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onToggleDark: () => void;
  onToggleFocusMode?: () => void;
  onNewTerminalTab: () => void;
  onCloseTerminalTab: () => void;
  onOpenShortcutsHelp: () => void;
}

/**
 * Listens for native menu events emitted by the Rust backend
 * and dispatches them to the appropriate frontend handlers.
 */
export function useMenuEvents({
  navigate,
  onToggleSidebar,
  onOpenCommandPalette,
  onToggleDark,
  onToggleFocusMode,
  onNewTerminalTab,
  onCloseTerminalTab,
  onOpenShortcutsHelp,
}: MenuEventHandlers) {
  // Navigation events — menu items that navigate to a route
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<string>("menu-navigate", (event) => {
      const route = event.payload;
      if (route) void navigate(route);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [navigate]);

  // Action events — menu items that trigger an action
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<string>("menu-action", (event) => {
      const action = event.payload;

      switch (action) {
        // App menu
        case "about":
          void navigate("/settings");
          // Scroll to about section after a tick
          requestAnimationFrame(() => {
            const el = document.getElementById("section-about");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          break;

        // File menu
        case "new_terminal":
          onNewTerminalTab();
          break;
        case "close_tab":
          onCloseTerminalTab();
          break;

        // View menu
        case "toggle_sidebar":
          onToggleSidebar();
          break;
        case "command_palette":
          onOpenCommandPalette();
          break;
        case "toggle_dark":
          onToggleDark();
          break;
        case "toggle_focus":
          onToggleFocusMode?.();
          break;

        // Window menu
        case "minimize":
          void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            void getCurrentWindow().minimize();
          });
          break;
        case "zoom":
          void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            void getCurrentWindow().toggleMaximize();
          });
          break;
        case "fullscreen":
          void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const win = getCurrentWindow();
            const isFull = await win.isFullscreen();
            void win.setFullscreen(!isFull);
          });
          break;

        // Help menu
        case "shortcuts_help":
          onOpenShortcutsHelp();
          break;
        // "website", "release_notes", "report_issue" are handled by the Rust
        // backend via tauri_plugin_opener (opens in the default browser).
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [
    navigate,
    onToggleSidebar,
    onOpenCommandPalette,
    onToggleDark,
    onToggleFocusMode,
    onNewTerminalTab,
    onCloseTerminalTab,
    onOpenShortcutsHelp,
  ]);
}
