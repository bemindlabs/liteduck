# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**LiteDuck** is a lightweight code editor desktop app built with Tauri v2 (Rust backend, React +
TypeScript frontend). Bundle ID: `com.bemindlabs.liteduck`.

It is a focused workspace with four capabilities — a **file browser + editor**, an **integrated
terminal**, **Git**, and **Settings**. It deliberately has **no AI/LLM features**, no chat, no
agents, no Docker/SSH/GitHub/Scrum integrations. (LiteDuck was derived from the larger "LoopDuck"
workspace by stripping all of those out.)

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

- **Router:** React Router v7, paths in `src/lib/routes.ts`. Routes: `/terminal`, `/files`,
  `/git`, `/notifications`, `/settings`, plus full-screen `/wizard` and `/landing`.
- **Layout:** `src/App.tsx` owns the sidebar + header + command palette. The **Terminal page is
  always mounted** (CSS visibility toggle) to preserve PTY sessions.
- **State:** React Context — `WorkspaceContext` (current/recent workspaces), `BiometricContext`.
- **Command palette:** Cmd+K. Registry in `src/lib/commands.ts`.
- **Keyboard shortcuts:** `useKeyboardShortcuts` hook (Cmd+1 Terminal, Cmd+3 Git, Cmd+, Settings,
  Cmd+K palette, Cmd+T/W terminal tabs, Cmd+Shift+F focus mode).
- **Setup Wizard:** first-run flow — Welcome → Dev Mode → Workspace → Initial Project → Summary.
- **Settings:** modular sections in `src/pages/settings/sections/` — General, Workspace, Git,
  Shortcuts, Device Identity, Biometric Lock, Permissions, About, Danger Zone.

### Backend Modules (`src-tauri/src/`)

| Domain    | Modules                                                                 | Purpose                                              |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Core      | `db.rs`, `settings.rs`, `keychain.rs`, `keyring_store.rs`, `workspace.rs`, `home.rs`, `app_menu.rs`, `updater.rs` | SQLite, keychain secrets, workspace init, app home, native menu, auto-updater |
| Terminal  | `terminal.rs`, `pty.rs`                                                  | PTY/tmux session management (managed state: `PtyManager`) |
| Files     | `files.rs`                                                               | File listing, read/write, rename/delete, open in VS Code |
| Git       | `git.rs`                                                                 | Status, log, diffs, branches, worktrees (git2)       |
| Identity  | `device_identity.rs`, `biometric.rs`                                    | Device fingerprint, biometric auth                   |
| Memory    | `agent_memory.rs`                                                        | Markdown note store backing `home.rs` cross-workspace memory |
| Infra     | `event_sink.rs`, `file_logger.rs`, `bash_validator.rs`                  | Event bus, file logging, shell command validation    |

Shared business logic (DB, settings store, device identity, traits) lives in the
`crates/liteduck-core` crate, consumed by `src-tauri` directly (and exposed via UniFFI for
potential mobile targets).

Tauri managed state: `PtyManager`, `EventSink`, `SecretStore` (keyring), `BiometricGateState`.

### Storage

```
User:      ~/.LoopDuck/ → config.json, profile.md, templates/, memory/   (home dir name kept from upstream)
Workspace: <ws>/.LoopDuck/ → config.json, templates/
```

> Note: the on-disk home/workspace data directory is still named `.LoopDuck` (the upstream
> convention) to avoid a churny data-path migration. Everything user-visible is "LiteDuck".

## Version Bumping

Update version in three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

## Testing

- **Frontend:** Vitest + jsdom. Test pattern `src/**/*.test.{ts,tsx}`.
- **E2E:** Playwright specs in `e2e/` (require a running app).
- **Rust:** `cargo test`. Keychain tests skip gracefully on Linux CI (no D-Bus secrets service).
