# LiteDuck

**A lightweight code editor** — fast, focused, and out of your way.

LiteDuck is a lightweight code editor built with Tauri v2. It brings a file browser + editor, an integrated terminal, and Git into a single fast native desktop app for macOS, Windows, and Linux — no AI, no clutter.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Mac App Store](https://img.shields.io/badge/Mac_App_Store-0D96F6?logo=apple&logoColor=white)](https://apps.apple.com/app/liteduck/id6744428938)
[![Homebrew](https://img.shields.io/badge/Homebrew-FBB040?logo=homebrew&logoColor=black)](https://github.com/bemindlabs/homebrew-liteduck)
[![Website](https://img.shields.io/badge/Website-buildonclaw.cloud-818cf8)](https://buildonclaw.cloud/products/liteduck)

## Install

### Mac App Store

[![Download on the Mac App Store](https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg)](https://apps.apple.com/app/liteduck/id6744428938)

### Homebrew (macOS)

```bash
brew install --cask bemindlabs/liteduck/liteduck
```

### Direct Download

- [macOS (Apple Silicon)](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck_2026.4.22_aarch64.dmg)
- [macOS (Intel)](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck_2026.4.22_x64.dmg)
- [Windows (.exe)](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck_2026.4.22_x64-setup.exe)
- [Linux (.deb)](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck_2026.4.22_amd64.deb) | [.AppImage](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck_2026.4.22_amd64.AppImage) | [.rpm](https://github.com/bemindlabs/liteduck-releases/releases/latest/download/LiteDuck-2026.4.22-1.x86_64.rpm)

## Features

| Feature | Description |
|---------|-------------|
| **File Manager** | Tree view, preview (code, images, markdown), inline editing, new file/folder, open in VS Code |
| **Terminal** | Tabs, split panes, tmux sessions, PTY |
| **Git** | Branch management, status, commits, diffs, worktrees |
| **Setup Wizard** | First-run wizard: dev mode, workspace, initial project |
| **Settings** | Modular sections, config (user/workspace), auto-save, biometric lock |

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
| `scripts/appstore-upload.sh` | Upload build to Mac App Store via Transporter |

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
    WizardPage.tsx            #   First-run setup wizard (welcome, dev mode, workspace, project)
    LandingPage.tsx           #   Landing / workspace picker
    settings/SettingsPage.tsx #   App settings (modular sections)
  components/                 # Reusable UI components (incl. ui/ shadcn primitives)
  hooks/                      # Custom React hooks (useConfig, useKeyboardShortcuts, …)
  lib/                        # Tauri IPC wrappers and utilities (one file per domain)
  contexts/                   # React contexts (Workspace, AppMode, Biometric)
src-tauri/                    # Backend (Rust, Tauri v2)
  src/
    lib.rs                    #   Tauri builder + command registration
    main.rs                   #   Entry point
    db.rs                     #   SQLite (runtime state / index)
    settings.rs               #   Settings with keychain storage
    keychain.rs / keyring_store.rs  # System keychain abstraction
    workspace.rs              #   Workspace init and templates
    home.rs                   #   ~/.LiteDuck home: config, profile, memory notes
    agent_memory.rs           #   Markdown note store backing home memory
    app_menu.rs               #   Native application menu
    updater.rs                #   Auto-updater
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
