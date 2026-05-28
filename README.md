<p align="center">
  <img src="public/liteduck.svg" alt="LiteDuck mascot" width="128" height="128" />
</p>

<h1 align="center">LiteDuck</h1>

<p align="center"><strong>A lightweight code editor</strong> — fast, focused, and out of your way.</p>

<p align="center">
  A file browser + editor, an integrated terminal, and Git in a single fast native desktop app
  for macOS (Windows &amp; Linux planned) — no AI, no clutter.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/bemindlabs/homebrew-liteduck"><img src="https://img.shields.io/badge/Homebrew-FBB040?logo=homebrew&logoColor=black" alt="Homebrew" /></a>
  <a href="https://buildonclaw.cloud/products/liteduck"><img src="https://img.shields.io/badge/Website-buildonclaw.cloud-818cf8" alt="Website" /></a>
</p>

## Install

### Homebrew (macOS)

```bash
brew install bemindlabs/liteduck/liteduck
```

This installs from the tap **`bemindlabs/homebrew-liteduck`** and **builds LiteDuck
from source** — Homebrew compiles the Tauri app locally with Node + Rust. There is
no prebuilt binary to download.

Update with Homebrew (there is **no in-app auto-updater**):

```bash
brew upgrade liteduck
```

> **Unsigned build.** Because LiteDuck is built from source, the resulting app is
> not code-signed or notarized. The first time you open it, macOS Gatekeeper may
> block it — right-click **LiteDuck.app** and choose **Open**, or run
> `xattr -dr com.apple.quarantine "$(brew --prefix)/opt/liteduck/LiteDuck.app"`.

> **Planned: Windows & Linux.** LiteDuck is macOS-only for now. Support for other
> platforms will follow once those targets ship.

## Features

| Feature | Description |
|---------|-------------|
| **File Manager** | Tree view, preview (code, images, markdown), inline editing, new file/folder, open in VS Code |
| **Terminal** | Tabs, split panes, tmux sessions, PTY |
| **Git** | Branch management, status, commits, diffs, worktrees |
| **Setup Wizard** | First-run wizard: welcome, workspace, initial project |
| **Settings** | Modular sections, config (global), auto-save, biometric lock |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, Vite 8, xterm.js |
| **Backend** | Rust, Tauri v2 |
| **Database** | SQLite (bundled via rusqlite) |
| **Auth** | System keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) |
| **Terminal** | portable-pty, xterm.js |
| **Git** | git2 (libgit2) |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
npm install
bash .githooks/install.sh   # Set up pre-commit and pre-push hooks
```

### Commands

```bash
npm run tauri:dev       # Development mode with hot reload (alias for `npm run tauri dev`)
npm run build:prod      # Production build
npm run build:debug     # Debug build
npm run test            # Run frontend tests (Vitest)
npm run test:coverage   # Tests with coverage report
npm run test:ci         # CI/local coverage gate (thresholds: 3-5%)
npm run lint            # ESLint
npm run lint:fix        # ESLint with auto-fix
npm run format          # Prettier format
npm run format:check    # Prettier check
npm run quality-gate    # Full quality check (tsc + format + lint + test + cargo)
```

Rust tests:

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
cd src-tauri && cargo fmt --check
```

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/build.sh` | Production build wrapper |
| `scripts/bump-version.sh` | Bump version across package.json, Cargo.toml, tauri.conf.json |

### Quality Gates

| Gate | What runs |
|------|-----------|
| **Pre-commit** | `cargo check --all-targets` |
| **Pre-push** | Frontend build (`tsc` + `vite`) + `cargo test` |
| **CI** | `npm run quality-gate` — TypeScript, ESLint, Prettier, Vitest, `cargo check`, `cargo clippy`, `cargo fmt`, `cargo test` |

## Architecture

```
src/                          # Frontend (React + TypeScript)
  pages/                      # Route pages
    FilesPage.tsx             #   File browser + editor
    TerminalPage.tsx          #   Terminal with tabs and splits (always mounted)
    GitPage.tsx               #   Git operations and diff viewer (Changes/History/Worktrees)
    NotificationsPage.tsx     #   In-app notification center
    WizardPage.tsx            #   First-run setup wizard (welcome, workspace, project)
    LandingPage.tsx           #   Landing / workspace picker
    settings/SettingsPage.tsx #   App settings (modular sections)
  components/                 # Reusable UI components (incl. ui/ shadcn primitives)
  hooks/                      # Custom React hooks (useConfig, useKeyboardShortcuts, …)
  lib/                        # Tauri IPC wrappers and utilities (one file per domain)
  contexts/                   # React contexts (Workspace, Biometric)
src-tauri/                    # Backend (Rust, Tauri v2)
  src/
    lib.rs                    #   Tauri builder + command registration
    main.rs                   #   Entry point
    db.rs                     #   SQLite (runtime state / index)
    settings.rs               #   Settings with keychain storage
    keychain.rs / keyring_store.rs  # System keychain abstraction
    workspace.rs              #   Workspace init and templates
    home.rs                   #   ~/.liteduck home: config, profile, memory notes
    agent_memory.rs           #   Markdown note store backing home memory
    app_menu.rs               #   Native application menu
    terminal.rs / pty.rs      #   Terminal and PTY/tmux handling
    files.rs                  #   File listing, read/write, rename/delete
    git.rs                    #   Git operations + worktrees (libgit2)
    device_identity.rs        #   Device identity generation
    biometric.rs              #   Biometric authentication
    event_sink.rs / file_logger.rs / bash_validator.rs  # Event bus, logging, shell validation
  icons/                      # App icons (macOS, Windows, Linux)
crates/
  liteduck-core/              # Shared business logic (DB, settings, identity; UniFFI-ready)
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow, coding conventions, and the quality gates your change must pass.

## License

Licensed under the [MIT License](LICENSE) — © 2026 Bemind Technology Co., Ltd. (bemindlabs).
