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
    function getDefault(cmd, args) {
      // Settings — return workspace so app doesn't redirect to /landing
      if (cmd === 'get_setting') {
        if (args && args.key === 'workspace_directory') return '/tmp/mock-workspace';
        if (args && args.key === 'wizard_completed') return 'true';
        if (args && args.key === 'openclaw_gateway_url') return 'http://localhost:18789';
        return null;
      }

      const defaults = {
        get_settings: { workspace_directory: '/tmp/mock-workspace' },
        save_setting: undefined,
        delete_setting: undefined,
        workspace_exists: false,
        workspace_init: undefined,
        workspace_list_recent: [],
        agents_list: [],
        agents_create: { slug: 'test', name: 'Test', role: '', status: 'active', tags: [], icon: '🤖', color: '#8B5CF6', content: '' },
        agents_get_profile: '',
        agents_save_profile: undefined,
        agents_delete: undefined,
        agents_list_memories: [],
        agents_list_tasks: [],
        terminal_create: { session_id: 'mock-sid-' + Date.now(), tmux_session: null },
        terminal_write: undefined,
        terminal_resize: undefined,
        terminal_close: undefined,
        terminal_list: [],
        terminal_list_tmux: [],
        terminal_attach: 'mock-sid',
        terminal_kill_tmux: undefined,
        terminal_rename_tmux: undefined,
        openclaw_check_connection: { connected: false, version: null, uptime: null, message: 'Mock' },
        openclaw_send_message: 'Mock AI response',
        openclaw_send_message_stream: undefined,
        openclaw_cancel_chat: undefined,
        openclaw_get_agents: [],
        openclaw_get_status: { connected: false, channels: [], providers: [], agent_count: 0 },
        git_status: { branch: 'main', files: [], ahead: 0, behind: 0, stashes: 0 },
        git_log: [],
        git_branches: [],
        git_diff: '',
        docker_ps: [],
        docker_images: [],
        docker_compose_services: [],
        scrum_list_projects: [],
        scrum_list_sprints: [],
        scrum_list_stories: [],
        scrum_list_epics: [],
        github_auth_check: null,
        github_list_repos: [],
        github_list_prs: [],
        a2a_get_card: { name: 'LiteDuck', version: '0.1.0', description: '', url: '', skills: [], defaultInputModes: [], defaultOutputModes: [], capabilities: {} },
        chat_session_list: [],
        chat_list_messages: [],
        chat_session_create: { id: 'mock', title: 'New Chat', created_at: new Date().toISOString() },
        files_list_dir: [],
        files_read_text: '',
        files_write_text: undefined,
        automations_list: [],
        workspace_check_templates: [],
        workspace_init_template: 'Initialized',
        mcp_list_server_configs: [],
        device_identity_get: { device_id: 'mock-device', hostname: 'mock' },
        lan_chat_start: undefined,
        lan_chat_stop: undefined,
        lan_chat_peers: [],
        ble_chat_start: undefined,
        ble_chat_stop: undefined,
        ssh_list_connections: [],
        ssh_list_profiles: [],
        biometric_available: false,
        dev_task_status: null,
        coding_workflow_generate_plan_cli: [
          { id: 'cli-1', description: 'Create component', step_type: 'create_file', file_path: 'src/Foo.tsx', content: 'export default function Foo() {}', command: null, status: 'pending' },
          { id: 'cli-2', description: 'Run tests', step_type: 'run_tests', file_path: null, content: null, command: 'npm test', status: 'pending' },
        ],
        coding_workflow_generate_plan: [
          { id: 'step-1', description: 'Create login component', step_type: 'create_file', file_path: 'src/Login.tsx', content: 'export default function Login() {}', command: null, status: 'pending' },
          { id: 'step-2', description: 'Add login route', step_type: 'edit_file', file_path: 'src/routes.ts', content: null, command: null, status: 'pending' },
          { id: 'step-3', description: 'Run tests', step_type: 'run_tests', file_path: null, content: null, command: 'npm test', status: 'pending' },
        ],
        coding_workflow_start: 'wf-mock-001',
        coding_workflow_status: { id: '', phase: 'planning', running: false, plan: null, current_step: null, total_steps: 0, fix_iteration: 0, logs: [], error: null, started_at: null, finished_at: null },
        coding_workflow_cancel: undefined,
        coding_workflow_logs: [],
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
