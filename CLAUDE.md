# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**LiteDuck** is a lightweight code editor desktop app built with Tauri v2 (Rust backend, React +
TypeScript frontend). Bundle ID: `com.bemindlabs.liteduck`.

It is a focused workspace with a **file browser + editor**, an **integrated terminal**, **Git**,
**Settings**, and a **manifest-based plugin system** (the sanctioned extension point). The core
deliberately has **no AI/LLM features**, no chat, no agents, no Docker/SSH/GitHub/Scrum integrations
baked in — integrations live in plugins, never in core. (LiteDuck was derived from the larger
"LoopDuck" workspace by stripping all of those out.)

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite, xterm.js
- **Backend:** Rust (Tauri v2), SQLite (rusqlite), Git (git2), PTY (portable-pty)
- **UI:** shadcn/ui components (`src/components/ui/`), lucide-react icons
- **Plugins:** tauri-plugin-opener, tauri-plugin-dialog

## Key Commands

```bash
npm install                # Install frontend dependencies
npm run tauri:dev          # Development mode with hot reload (port 1420)
npm run build              # Type-check + bundle the frontend (tsc && vite build)
npm run build:prod         # Production build (Tauri desktop bundle)
npm test                   # Vitest unit tests
npm run lint               # ESLint
npm run format             # Prettier fix
```

Rust-only checks (run from `src-tauri/`):

```bash
cargo check                # Type check
cargo fmt -- --check       # Format check
cargo clippy               # Lint
cargo test                 # Rust unit tests
```

## Architecture

### Tauri IPC Pattern

Frontend ↔ backend communication uses Tauri's `invoke`. Each Rust module exposes
`#[tauri::command]` functions registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`.
Frontend wrappers live in `src/lib/` (one file per domain, e.g. `src/lib/git.ts` → `git.rs`).
All commands return `Result<T, String>`.

### Frontend

- **Workspace shell (primary surface):** the app is a **VS Code-style workspace**, not a simple
  router-of-pages. `src/components/workspace/` composes `WorkspaceShell` from `ActivityRail` +
  `SidePanel` (file tree) + `EditorArea`/`EditorTabs` + a collapsible `TerminalDock` + `StatusBar`,
  all visible at once. Pages render *inside* the shell: Git, Plugins, and Settings render full-width
  in the editor-area slot (the activity rail, terminal dock, and status bar stay visible).
- **Router:** React Router v7, paths in `src/lib/routes.ts`. Routes (`/terminal`, `/files`, `/git`,
  `/notifications`, `/settings`, `/plugins`, plus full-screen `/wizard`, `/landing`) drive which
  panel the shell shows rather than swapping whole pages.
- **Layout:** `src/App.tsx` owns the command palette and forwards imperative shell toggles
  (Cmd+B side panel, Cmd+` terminal dock, Cmd+Shift+` terminal full-view). The **Terminal dock is
  always mounted** (CSS visibility toggle) to preserve PTY sessions, and has a maximize/full-view
  mode that fills the editor+terminal column.
- **State:** React Context — `WorkspaceContext` (current/recent workspaces), `BiometricContext`.
- **Command palette:** Cmd+K. Registry in `src/lib/commands.ts`.
- **Keyboard shortcuts:** `useKeyboardShortcuts` hook (Cmd+1 Terminal, Cmd+3 Git, Cmd+, Settings,
  Cmd+K palette, Cmd+T/W terminal tabs, Cmd+Shift+F focus mode, Cmd+B side panel,
  Cmd+` terminal dock, Cmd+Shift+` terminal full-view).
- **Context menus + drag:** native browser menus are suppressed globally; right-click surfaces
  context-aware menus (`src/components/ui/ContextMenu.tsx`). Dragging a file/folder from the tree
  onto the terminal inserts its shell-quoted path (`src/utils/shellQuote.ts`).
- **Version display:** `src/lib/version.ts` → the standalone `get_app_version` command (no network,
  no auto-updater).
- **Setup Wizard:** first-run flow — Welcome → Dev Mode → Workspace → Initial Project → Summary.
- **Settings:** modular sections in `src/pages/settings/sections/` — General, Workspace, Git,
  Shortcuts, Device Identity, Biometric Lock, Permissions, About, Danger Zone.

### Backend Modules (`src-tauri/src/`)

| Domain    | Modules                                                                 | Purpose                                              |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Core      | `db.rs`, `settings.rs`, `keychain.rs`, `keyring_store.rs`, `workspace.rs`, `home.rs`, `app_menu.rs` | SQLite, keychain secrets, workspace init, app home, native menu |
| Terminal  | `terminal.rs`, `pty.rs`                                                  | Raw PTY session management (managed state: `PtyManager`) |
| Files     | `files.rs`                                                               | File listing, read/write, rename/delete, open in VS Code (hides OS clutter: `.DS_Store`, `Thumbs.db`, …) |
| Git       | `git.rs`                                                                 | Status, log, diffs, branches, worktrees (git2)       |
| Plugins   | `plugins.rs`                                                             | Plugin manifest loader, install/list/run, GitHub registry fetch |
| Identity  | `device_identity.rs`, `biometric.rs`                                    | Device fingerprint, biometric auth                   |
| Memory    | `agent_memory.rs`                                                        | Markdown note store backing `home.rs` cross-workspace memory |
| Infra     | `event_sink.rs`, `file_logger.rs`, `bash_validator.rs`                  | Event bus, file logging, shell command validation    |

Shared business logic (DB, settings store, device identity, traits) lives in the
`crates/liteduck-core` crate, consumed by `src-tauri` directly (and exposed via UniFFI for
potential mobile targets).

Tauri managed state: `PtyManager`, `EventSink`, `SecretStore` (keyring), `BiometricGateState`.

### Plugin System

The sanctioned extension point that keeps integrations *out* of core (`src-tauri/src/plugins.rs`;
frontend `src/lib/plugins.ts` + `src/components/plugins/PluginsPanel.tsx`).

- **Hybrid model:** a plugin is a folder under `~/.liteduck/plugins/<id>/` with a `plugin.json`
  manifest (declarative) whose contributed commands run as **shell subprocesses** (`sh -c`) with
  the user's privileges. The host loads no plugin code into its own address space; parameters pass
  as `LITEDUCK_PARAM_<KEY>` env vars (never string-interpolated, to avoid shell injection).
- **Rendering:** by default a command's stdout renders via **built-in declarative views**
  (`view: text|table|list|keyvalue|markdown`). A plugin MAY instead declare an **executable UI**
  (`ui: { entry }`, ADR-002) served from the **`plugin://` custom scheme** — a separate origin,
  cross-origin to the host (no host DOM / Tauri access), under its own per-response CSP, embedded
  in an iframe and driven by a `postMessage` bridge (`PluginHostFrame`). The host still runs no
  plugin code in its address space, and `run-command` is gated to the plugin's declared commands.
- **Scope-ceiling deny-list:** manifests are validated against an allow-list of `kind`
  (`integration`, `formatter`, `linter`, `previewer`, `tool`) and a redundant deny-list
  (`chat`, `agent`, `llm`). Any AI/LLM-shaped plugin is **refused at load time, before any file
  touches disk** — the no-AI charter is enforced by the schema, not by review discipline.
- **Install sources:** from a **local folder** (`plugin_install`) or from the **GitHub registry**
  `bemindlabs/liteduck-plugins` (`plugin_install_from_registry`, `plugin_registry_fetch`). Loading
  is lazy — nothing is scanned on startup. The app ships **lean** (`tauri.conf.json` bundles no
  plugins); the reference plugins (`jira`, `bwoc`) live under `src-tauri/resources/plugins/` only
  as the **registry source** and are installed on demand from the registry.
- **Sandbox (v1):** subprocesses inherit the user's full privileges (user-trust). Manifests declare
  `network` + host `paths`, surfaced in the install confirmation UI; a real OS sandbox is a
  documented future phase. A plugin's **executable UI** runs isolated by origin (the `plugin://`
  scheme is cross-origin to the host and under a locked-down per-response CSP — `connect-src
  'none'`); an iframe `sandbox` attribute is Phase 2 hardening.

### Storage

LiteDuck stores everything **globally**, in a single user-level home directory.
There is no per-workspace data directory — nothing is written into the project folder.

```
~/.liteduck/ → config.json, profile.md, workspaces.json, templates/, memory/, logs/
```

> Overridable with `$LITEDUCK_HOME`. On first launch, a legacy `~/.LiteDuck` directory
> (the previous PascalCase name) is migrated to `~/.liteduck` automatically.

## Version Bumping

Update version in three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

## Testing

- **Frontend:** Vitest + jsdom. Test pattern `src/**/*.test.{ts,tsx}`.
- **E2E:** Playwright specs in `e2e/` (require a running app).
- **Rust:** `cargo test`. Keychain tests skip gracefully on Linux CI (no D-Bus secrets service).
