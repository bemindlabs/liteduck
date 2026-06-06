import type { Page } from "@playwright/test";

/**
 * Comprehensive Tauri IPC mock for E2E testing with Playwright.
 * Mirrors the structure from `@tauri-apps/api/mocks` so that
 * `invoke`, `listen`, `emit`, and event cleanup all work correctly.
 */
export function tauriMockScript(): string {
  return `
    // ── Callback registry (used by listen/emit) ──
    const callbacks = new Map();

    function registerCallback(callback, once) {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        return callback && callback(data);
      });
      return id;
    }

    function unregisterCallback(id) {
      callbacks.delete(id);
    }

    function runCallback(id, data) {
      const cb = callbacks.get(id);
      if (cb) cb(data);
    }

    // ── Event listeners (for listen/unlisten/emit) ──
    const listeners = new Map();

    function handleListen(args) {
      if (!listeners.has(args.event)) listeners.set(args.event, []);
      listeners.get(args.event).push(args.handler);
      return args.handler;
    }

    function handleEmit(args) {
      const evListeners = listeners.get(args.event) || [];
      for (const handler of evListeners) runCallback(handler, args);
      return null;
    }

    function handleUnlisten(args) {
      const evListeners = listeners.get(args.event);
      if (evListeners) {
        const idx = evListeners.indexOf(args.eventId);
        if (idx !== -1) evListeners.splice(idx, 1);
      }
      unregisterCallback(args.eventId);
    }

    // ── IPC defaults ──
    // Commands that resolve to undefined (fire-and-forget mutations). Listed
    // separately because JSON round-tripping an undefined value throws.
    const VOID_COMMANDS = new Set([
      'save_setting', 'delete_setting', 'reset_all_settings', 'preload_secrets',
      'workspace_init', 'workspace_init_template', 'workspace_scaffold',
      'terminal_write', 'terminal_resize', 'terminal_close',
      'files_write_text', 'files_watch', 'files_unwatch', 'files_copy', 'files_move',
      'files_delete', 'files_rename', 'files_create_dir', 'files_reveal_in_os',
      'files_open_in_vscode',
      'git_init', 'git_worktree_add', 'git_worktree_remove', 'git_worktree_prune',
      'home_ensure', 'home_config_write', 'home_profile_write', 'home_memory_write',
      'home_memory_delete', 'home_workspaces_update', 'home_migration_run',
      'plugin_install', 'plugin_install_from_registry', 'plugin_uninstall',
      'plugin_run_command', 'plugin_open_external',
      'device_reset_identity', 'biometric_set_gate',
      'window_open', 'window_set_workspace',
    ]);

    function getDefault(cmd, args) {
      // Settings — return a workspace so the app doesn't redirect to /landing.
      if (cmd === 'get_setting') {
        if (args && args.key === 'workspace_directory') return '/tmp/mock-workspace';
        if (args && args.key === 'wizard_completed') return 'true';
        return null;
      }

      if (VOID_COMMANDS.has(cmd)) return undefined;

      // Lean defaults — only commands the current app actually invokes.
      const defaults = {
        get_settings: { workspace_directory: '/tmp/mock-workspace' },
        get_app_version: '0.0.0-e2e',
        path_exists: false,
        workspace_check_templates: [],
        terminal_create: { session_id: 'mock-sid' },
        git_status: { branch: 'main', files: [], ahead: 0, behind: 0, stashes: 0 },
        git_current_branch: 'main',
        git_log: [],
        git_list_branches: [],
        git_diff_working: '',
        git_diff_commit: '',
        git_scan_repos: [],
        git_worktree_list: [],
        files_list_dir: [],
        files_read_text: '',
        files_find: [],
        files_get_metadata: null,
        home_config_read: {},
        home_resolve_config: {},
        home_dir_path: '/tmp/.liteduck',
        home_workspaces_list: [],
        home_templates_list: [],
        home_memory_list: [],
        home_memory_search: [],
        home_memory_read: '',
        home_profile_read: '',
        home_migration_check: false,
        plugin_list: [],
        plugin_registry_fetch: [],
        device_get_identity: { device_id: 'mock-device', hostname: 'mock' },
        biometric_status: { available: false, enabled: false },
        biometric_authenticate: false,
        window_current_label: 'main',
        window_list: [{ label: 'main' }],
      };

      if (cmd in defaults) return JSON.parse(JSON.stringify(defaults[cmd]));
      return null;
    }

    // ── Main invoke handler ──
    function invoke(cmd, args) {
      // Event plugin commands
      if (cmd === 'plugin:event|listen') return Promise.resolve(handleListen(args));
      if (cmd === 'plugin:event|unlisten') { handleUnlisten(args); return Promise.resolve(); }
      if (cmd === 'plugin:event|emit' || cmd === 'plugin:event|emit_to') { handleEmit(args); return Promise.resolve(); }

      // Window/webview plugin commands
      if (cmd.startsWith('plugin:window|') || cmd.startsWith('plugin:webview|')) {
        if (cmd === 'plugin:window|is_fullscreen') return Promise.resolve(false);
        if (cmd === 'plugin:window|is_maximized') return Promise.resolve(false);
        if (cmd === 'plugin:window|is_focused') return Promise.resolve(true);
        if (cmd === 'plugin:window|scale_factor') return Promise.resolve(1);
        if (cmd === 'plugin:window|inner_size') return Promise.resolve({ width: 1280, height: 800 });
        return Promise.resolve(undefined);
      }

      // Other plugin commands
      if (cmd.startsWith('plugin:')) return Promise.resolve(undefined);

      // App commands
      return Promise.resolve(getDefault(cmd, args));
    }

    // ── Set up globals ──
    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: registerCallback,
      unregisterCallback,
      runCallback,
      callbacks,
      convertFileSrc: (path) => path,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
        windows: [{ label: 'main' }],
        webviews: [{ label: 'main' }],
      },
    };

    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event, id) => {
        handleUnlisten({ event, eventId: id });
      },
    };
  `;
}

/** Add Tauri mock to page before navigation. */
export async function mockTauri(page: Page): Promise<void> {
  await page.addInitScript(tauriMockScript());
}
