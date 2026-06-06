# Changelog

All notable changes to LiteDuck are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Calendar Versioning](https://calver.org/) (YYYY.M.D).

> **Heritage note.** LiteDuck began as "LoopDuck", an AI-first workspace. Releases before
> the editor-only refocus (see **[Unreleased]**) shipped agents, an AgentsCouncil/Scrum
> pipeline, AI chat, an OpenClaw gateway, MCP/A2A, Docker, SSH, and GitHub/Jira
> integrations. Those features have been removed. Historical entries below are condensed —
> the now-removed work is summarized rather than detailed, and the editor-relevant changes
> (Files, Terminal, Git, Settings, platform, distribution) are preserved.

---

## [Unreleased]

## [2026.6.6] - 2026-06-06

### Added

- **VS Code-style editor tab management.** Pinned tabs (kept to the left with a pin
  affordance, surviving Close All / Close Others), drag-to-reorder, and a per-tab
  right-click menu (Close, Close Others, Close All, Close to the Right, Pin/Unpin,
  Copy Path, Reveal in Finder). Reopen-closed-tab history (last 10) and next /
  previous / go-to-tab navigation. New shortcuts: context-aware **Cmd+W** (closes the
  editor tab when editing, the terminal tab when the terminal is focused),
  **Cmd+Alt+W** Close All Tabs, **Cmd+Shift+T** Reopen Closed Tab, **Cmd+Alt+←/→**
  next/previous tab, **Cmd+Alt+1–9** go to tab. Middle-click a tab to close it. All
  actions are also in the command palette.

### Fixed

- **Drag-and-drop into the terminal and file tree now works.** HTML5 drag-and-drop is
  swallowed by Tauri's native file-drop handler (required so external Finder/Explorer
  drops deliver real filesystem paths), which had broken every in-app drag. Internal
  drags (file tree → terminal, file tree → folder, tab reorder) now use a pointer-based
  drag system; dragging a file from Finder onto the terminal inserts its shell-quoted
  path.

## [2026.6.3] - 2026-06-03

### Added

- **Code editor — CodeMirror 6.** The editor moved from a `<textarea>` + custom-regex
  highlight overlay to CodeMirror 6, bringing standard editor features: language-aware
  syntax highlighting (lazy-loaded grammars for JS/TS/Rust/Python/JSON/Markdown/HTML/CSS/
  YAML and more), **find & replace** (Cmd+F), a real undo/redo history, bracket matching +
  auto-close, smart auto-indent, code folding, and multi-cursor. The theme is bound to the
  app's design tokens so it looks identical to the rest of the UI. Markdown editing
  (edit/split) runs on the same editor; the formatting toolbar drives it via an imperative
  handle.
- **File manager — richer right-click menu.** The file-tree context menu now offers
  **Cut / Copy / Paste**, **Duplicate**, **New File / New Folder** (on a folder),
  **Copy Relative Path**, and **Reveal in Finder**, alongside the existing Rename / Delete /
  Copy Path / Open in VS Code / Open Terminal Here. The empty Explorer area has its own
  background menu (New File / New Folder / Paste / Refresh).
- **Drag-to-move.** Dragging a tree entry onto a folder moves it there (collision-safe
  naming); dragging onto the terminal still inserts its path.
- **File-manager backend commands:** `files_copy`, `files_move` (cross-device safe),
  `files_reveal_in_os`, `files_find` (bounded recursive name search), and
  `files_watch`/`files_unwatch` (filesystem change events via the `notify` crate).
- **Error surfacing.** Failed file operations (copy/move/rename/delete/create) now raise a
  notification instead of failing silently.
- **Live auto-refresh.** The file tree now watches the workspace (`files://changed`) and
  refreshes **in place** on external changes — expanded folders stay open (no remount).
  Events are debounced.
- **App zoom.** Cmd/Ctrl `+` / `-` adjusts the overall UI/text size and Cmd/Ctrl `0`
  resets it (browser-style, persisted across launches). Listed under Appearance in the
  keyboard-shortcuts help.

### Fixed

- **Notifications page now matches the app.** The notification categories are the ones
  LiteDuck actually emits — **System / File / Terminal** — replacing the dead "GitHub"
  category left over from LoopDuck (nothing ever produced it). File-op and terminal
  failures are now tagged with their real category, so the page's type filter is
  meaningful.

### Changed

- Relaxed the prior "no external dependencies" stance for the editor specifically —
  CodeMirror is the standard, added with lazy language loading to keep the bundle lean.

### Notes

- Multi-select and full keyboard tree navigation remain deferred (they need a flattened
  tree model).

## [2026.5.29] - 2026-05-29

### Added: Multi-window support

LiteDuck can now open multiple top-level windows, each targeting its own
workspace, with per-window state isolation.

- **File → New Window** (`Cmd+Shift+N`) clones the current window's workspace
  into a new window; **File → New Window with Workspace…** opens a new window
  on the workspace picker; **Close Window** (`Cmd+Shift+W`).
- **Per-window workspace** — each window resolves its workspace from its entry
  URL / the `~/.liteduck/windows.json` registry, so windows no longer share a
  single global workspace.
- **Per-window terminals** — PTY sessions are tagged with their owning window;
  `pty-output` and the terminal tab list are scoped per window instead of
  shared across the process.
- **Window-scoped menu + PTY events** — native menu actions and PTY events are
  delivered only to the focused/owning window (via `getCurrentWebview().listen`
  + `emit_to`), fixing cross-window leakage.

### Distribution: Homebrew-formula-from-source only

LiteDuck is now distributed **only** as a build-from-source Homebrew formula. The
CI release pipeline, DMG releases, and in-app auto-updater have all been removed.

- **Added** — `HomebrewFormula/liteduck.rb` rewritten from a cask (prebuilt DMG)
  into a formula that compiles the Tauri app from the tagged GitHub source archive.
  The LiteDuck repo doubles as its own Homebrew tap (no separate
  `homebrew-liteduck` repo): install with
  `brew tap bemindlabs/liteduck https://github.com/bemindlabs/liteduck` then
  `brew install bemindlabs/liteduck/liteduck`; update with `brew upgrade liteduck`.
  The build is unsigned/un-notarized (Gatekeeper may need right-click → Open on
  first launch) — the deliberate trade-off of source dist.
- **Removed** — in-app **auto-updater** (`updater.rs`, `src/lib/updater.ts`, the
  `UpdateChecker`/`UpdateDialog` UI, the "Check for Updates" menu item and its
  24-hour background check). The About section now just shows the version and
  points to `brew upgrade`. Version display is preserved via a standalone
  `get_app_version` command.
- **Removed** — the **release CI** (`.github/workflows/release.yml` build → sign →
  notarize → publish → update-homebrew, and `auto-release.yml` auto-tagging). No
  more `RELEASE_PAT` / `PUBLIC_RELEASE_TOKEN` / Apple signing secrets. Releasing is
  now: bump version, tag, push, bump the formula's version + sha256 (see
  `docs/RELEASING.md`). The quality CI (`ci.yml`) and E2E regression
  (`regression.yml`) workflows are unchanged.

### Refocused to an editor-only product (LoopDuck → LiteDuck)

LiteDuck is now a lightweight, editor-only desktop app. See
[ADR-001](docs/adr-001-single-direction.md) for the decision and rationale.

#### Kept

- **File browser + editor** — tree view, inline editing, preview (code, images, markdown).
- **Integrated terminal** — PTY, tabs, split panes, tmux sessions.
- **Git** — status, log, diffs, branches, stage/unstage, commit/push/discard, worktrees.
- **Settings** — modular sections, JSON config (`~/.LiteDuck` + workspace `.LiteDuck`), OS
  keychain secrets, biometric lock, device identity.

#### Removed

- **AI / LLM** — Ask AI, code generation, model switcher, the OpenClaw gateway, and the
  in-header AI activity indicator.
- **Agents** — agent launcher, agent profiles/memory UI, and the AgentsCouncil / AgentsSCRUM
  deliberation pipeline.
- **Scrum** — projects, epics, stories, sprints, kanban board, burndown/velocity, and the
  scrum settings.
- **Workflow engine** — coding workflow, pipelines, the automations runner, and the
  orchestrator.
- **MCP & A2A** — the internal MCP registry/bus, the external MCP bridge on port 18790, and
  Agent-to-Agent transport.
- **Chat** — team chat, LAN/BLE mesh routing, and group mentions.
- **Docker / Compose**, **SSH / SFTP**, the **embedded browser**, and the **GitHub / Jira**
  integrations.

## [2026.5.2] - 2026-05-02

### Changed
- **TLS crypto provider at startup** — Install rustls' default crypto provider
  (`aws_lc_rs`) via `CryptoProvider::install_default()` at process start, wrapped in an
  explicit `match` so the "already installed" branch (e.g. dev hot-reload) is a documented
  no-op and future error variants surface on `stderr`. Multiple TLS deps pulled rustls 0.23
  with conflicting/no provider features, so no provider was auto-selected. Keeps every
  in-app HTTPS path — including the auto-updater against GitHub Releases — working reliably.

## [2026.4.22] - 2026-04-22

## [2026.4.16] - 2026-04-16

_This release was predominantly LoopDuck-era AI/workflow work (AI activity indicator,
coding-automation seeding, FIFO pipeline queue with parallel lanes, pipeline timeline UI,
unified pipeline store) — all removed in the editor-only refocus. See **[Unreleased]**._

## [2026.4.14] - 2026-04-14

### Added
- **Biometric gate and lock screen** — backend `BiometricGateState` blocks secret access
  when locked; `useIdleTimer` hook auto-locks after configurable inactivity;
  `BiometricLockScreen` full-screen overlay with native unlock
- **Session-lifetime secret cache** — OS keychain secrets cached for the app session;
  `preload_secrets` fetches all at startup so the password dialog appears only once
- **Settings: editor config fields exposed** — font family, font size, sidebar position,
  terminal shell, scrollback lines, and the biometric idle-timeout picker
- **Settings danger zone** — reset all settings and clean data actions
- **Tmux window operations** — create, rename, close, and switch tmux windows from the
  terminal UI; window-aware tab display
- **Design system reference** — Tokens Studio JSON for Figma import (`.design/tokens.json`)
  and a visual HTML reference page (`.design/design-system.html`)

### Changed
- **git.rs refactored** — business logic extracted into `_inner` functions; Tauri commands
  are now thin wrappers
- **Settings reads from config.json** — `get_settings` (bulk) and `save_setting` use
  config.json instead of only SQLite
- **Settings sidebar grouped by scope** — Project-scoped items under "Project", global items
  under "Global"
- **`telegram_bot_token` moved to SECRET_KEYS** — now consistently stored in the OS keychain
- **Modernized UI** — dialog modals with shadow/entrance animations, landing page polish,
  improved Markdown rendering, terminal tab enhancements
- **ConfirmDeleteDialog** — merged duplicate delete dialogs into one reusable component

_Also in this release (removed in the editor-only refocus): Internal MCP registry/bus and
the external bridge on port 18790, the automation execution engine and orchestrator, a
shared-memory bridge, team-chat group mentions, AgentsSCRUM session/summary/bridge work, and
AI epic/story/backlog generators. See **[Unreleased]**._

## [2026.4.12] - 2026-04-12

### Changed
- **Remove bundled resource templates** — workspace init now only creates the `.LiteDuck`
  directory structure
- **Wizard pre-populates existing settings** — all steps load saved values on mount
- **Gitignore templates** — added "None (minimal)" option; `.LiteDuck` included in all
  templates; default changed from Node.js to None
- **Standardize .LiteDuck casing** — PascalCase across docs and code; added
  `.liteduck` → `.LiteDuck` migration on case-sensitive filesystems

### Fixed
- **PR review comments** — security (redact raw response), stale closures, z-index
  consistency, React key stability, secret-cache TTL reduced to 1h
- **Release workflow** — tag-vs-config version validation prevents mismatched releases;
  upgraded `action-gh-release` (Node.js 20 deprecation)
- **Merge conflict** — resolved CHANGELOG and README divergence between main and develop

## [2026.4.11] - 2026-04-12

### Added
- **~/.LiteDuck application home** — global config.json, profile.md, workspaces.json,
  template resolution, config merge strategy, `LITEDUCK_HOME` override, migration wizard
- **Workspace-scoped data isolation** — `.LiteDuck/` directory per workspace; switching
  workspaces changes visible data
- **Settings page redesign** — 17 modular section components (<300 lines each), reactive
  `useConfig()` hook, `useDebouncedSave` auto-save, `useFieldValidation` inline errors
- **Splash screen** — branded, theme-aware on first load
- **Centralized logger** — `createLogger()` utility replacing `console.*`
- **Vite code splitting** — React.lazy route-level splitting and manual vendor chunks
- **16 new test files** for previously untested lib modules (LD-77, LD-78)

### Changed
- **HTTP connection pooling** — single static `reqwest::Client` via `OnceLock` replaces 18
  per-call `build_client()` invocations
- **SQLite connection pooling** — single shared connection via `OnceLock<Mutex<Connection>>`
  replaces 63 per-command `db::open()` calls
- **Config cache** — `read_config()`/`resolve_config()` cached with 5-minute TTL, invalidated
  on write
- **settings.db deprecated** — `get_setting_v2()` reads config.json first (cached), falls
  back to SQLite for unmigrated keys
- **Dependency upgrades** — Vite 8, React 19.2, React Router 7.14, rusqlite 0.39, git2 0.20,
  reqwest 0.13
- **LandingPage** refactored into modular components
- **Page and component extraction** — monolithic pages split into `src/pages/<domain>/` and
  `src/components/<domain>/`

### Fixed
- `cargo fmt` in `liteduck-core`; Clippy warnings (`drain_collect`, consecutive
  `str::replace`, `useless_format`, `collapsible_if`, `&PathBuf` → `&Path`, derivable
  `Default`)
- **Settings invoke timeout** — added HTTP timeouts and increased IPC tolerance to prevent a
  "Saving..." hang
- **Splash screen** dark/light theme awareness
- **Windows icon** — converted `icon.ico` to a proper multi-size ICO
- **Release workflow** — tag-vs-config version validation; upgraded `action-gh-release`

_Also in this release (removed in the editor-only refocus): Agents SCRUM (8-phase council),
the orchestrator, the wave-based Dev Mode engine, council profiles, review/retrospective
panels, the coding-workflow step refinement, the composable pipeline builder, and file-based
automation storage. See **[Unreleased]**._

## [2026.4.8] - 2026-04-08

### Added
- **iOS Tauri app** — full Tauri v2 iOS support with edge-to-edge WebView, safe-area
  handling
- **Mobile responsive layout** — CSS `min()` fallbacks, `sm:` breakpoints, responsive gaps
- **Mobile sidebar UX** — slide animation, swipe gestures, haptic feedback, 44px touch
  targets
- **Shared Xcode workspace** — `mobile/LiteDuck.xcworkspace` with combined Makefile
- **watchOS app icons** — 13 sizes generated from the mascot SVG
- **Dynamic app version** — `getAppVersion()` falls back to the Tauri API on iOS
- **Theme-color meta** — dark/light `<meta name="theme-color">` synced on theme toggle

### Changed
- **App icons** — regenerated from `liteduck-mascot.svg` (desktop, iOS, Android, watchOS,
  Windows Store)
- **Footer version** — dynamic in all locations; removed hardcoded "v0.1.0"
- **Viewport meta** — removed `user-scalable=no`/`maximum-scale=1.0` for accessibility
- **CI workflow** — cargo fmt/clippy/test run from workspace root with `--workspace`

### Fixed
- **Bottom space on iOS** — disabled WKWebView automatic safe-area inset via `objc2` FFI
- **iOS window background** — dark `#0f0b16` matched to theme
- **watchOS deployment target** — lowered to 10.0 for watchOS 11.x devices
- **Release build** — guarded `open_devtools()` behind `#[cfg(debug_assertions)]`
- **CI disk space** — resolved exhaustion during `cargo test`
- **E2E tests** — terminal tab-count assertion changed from exact to relative

### Removed
- **Native iOS app** (`mobile/ios/`) — replaced by the Tauri iOS app

## [2026.4.6] - 2026-04-06

### Fixed
- **Release workflow** — macOS builds failing with "specified item could not be found in the
  keychain" because GitHub Actions `if:` conditions can't read step-level `env:` blocks;
  moved secret checks into shell guards
- **Code signing gate** — `APPLE_SIGNING_IDENTITY`/`APPLE_ID*` exported only when
  `APPLE_CERTIFICATE` is also configured, preventing "sign with empty identity" failures
- **Notarization verification** — same `if:`-condition fix applied to the verify step

## [2026.4.4] - 2026-04-03

### Changed
- **ESLint** — stricter TypeScript rules, `eslint-plugin-unused-imports`, and related UI
  cleanup (`truncate-path`, `mini-duck-colors`, `useReadingSettings`)
- **CI / Release** — workflow `permissions`, pinned actions (`tauri-action` v0.6.2,
  `action-gh-release` v2.6.1, `rust-cache` v2.9.1), macOS signing `base64 -d`

### Fixed
- **ReadingView** heading scroll, **Settings** diagnostics props, and Prettier drift on
  `SettingsPage`
- **Rust** — Clippy `items_after_test_module` (`device_identity`)

## [2026.4.3] - 2026-04-03

### Added
- **Git worktrees** — backend commands (list, add, remove, prune) and Git page list/status
- **Workspace quick switcher** in the header; workspace **context provider** with reactive
  updates on switch
- **Tmux** session mode for new terminals; **session picker**; kill/destroy from the UI
- **Keychain `get_secrets` batch** command for settings
- **Release / quality infrastructure** — production build pipeline, Vitest coverage
  expansion, Playwright settings alignment

### Changed
- App menu / sidebar — **Terminal** first under Development
- Workspace API — standardized **`workspace_directory`** naming (replacing `workspace_path`)
- **CI / Release** — GitHub Actions on Node 24–compatible majors; quality-gate job
  (`npm run quality-gate` + version sync) before platform builds
- **DLC product surface removed** — DLC page, Scrum DLC markdown, related Tauri commands, and
  shortcut/notification references

### Fixed
- macOS **Edit** menu — native `PredefinedMenuItem` so Cmd+C / Cmd+V work reliably
- `.gitignore` — Playwright `playwright-report/`, `test-results/`, `blob-report/`

_Also in this release (removed in the editor-only refocus): the OpenClaw Skills Browser,
plugin management, the gateway Doctor, the AI model switcher, agent multi-select/bulk
actions, Ask AI multi-turn context, the agent workspace selector, the Scrum board Local/Jira
toggle, and the GitHub clone dialog. See **[Unreleased]**._

## [2026.4.2] - 2026-04-02 — Developer Preview

### Added
- **Session management** — kill-session command and backlog session reuse
- **Auto-update checker** with GitHub Releases integration
- **Focus mode** toggle (Cmd+Shift+F) via the command palette
- **Native Edit menu** and improved Help menu with clipboard key handlers
- **FilePreview** expanded format support and improved UX
- **File logger** for diagnostics
- **Playwright e2e** test setup
- Homebrew cask auto-update step in the release workflow
- Publish signed/notarized release assets directly on `bemindlabs/liteduck`

### Changed
- **Versioning switched from SemVer to CalVer** (YYYY.M.D)
- Extracted a reusable Select component, replacing native `<select>` elements
- Merged READ mode into DOCS mode (distraction-free reading)
- Renamed `.devcanvas` to `.LiteDuck` across backend and frontend
- Updated icons, configs, app pages, and project tooling
- Coverage thresholds updated to match current levels

### Fixed
- PTY session now stays alive after a command completes
- Clippy warnings — added `Default` impl and used `clamp()`
- Ref updates moved to `useEffect` to satisfy `react-hooks/refs` lint
- ESLint warnings and Prettier formatting across the codebase

_Also in this release (removed in the editor-only refocus): team chat over BLE mesh, the
agent memory system, the dev-task system, the embedded browser, and Jira bidirectional sync.
See **[Unreleased]**._

## [0.1.4] - 2026-04-01

### Added
- CLAUDE.md for Claude Code context
- Mac App Store distribution with a signed `.pkg` and entitlements
- App Store upload script (`scripts/appstore-upload.sh`) and store button on the website
- macOS Xcode project with full icon set (iOS + macOS)
- Claude Code hooks (`.claude/hooks/`) for type-checking, pre-commit, pre-push, version sync
- Cross-platform builds: macOS aarch64 + x64 DMGs, Windows, Linux via CI

### Changed
- Comprehensive README with feature tables, architecture map, and install options
- Switched direct distribution from `.pkg` back to `.dmg` (standard macOS UX)
- Homebrew cask includes a `postflight` xattr fix for Gatekeeper

### Fixed
- TypeScript strict-mode fixes (FilePreview, GitPage, WizardPage)
- Notification type corrections in `useTerminal` (`"error"` → `"system"`)
- Keychain error handling for Linux CI (D-Bus / platform secure storage)
- Linux CI — removed deprecated `libappindicator3-dev`, added `libdbus-1-dev`
- Release workflow — `contents: write` permission on the build job
- Homebrew cask SHA256 and `.ico` icon-size fixes

## [0.1.3] - 2026-03-31

### Added
- Quality gates — `.githooks/` with pre-commit (`cargo check`) and pre-push (`tsc` +
  `vite build` + `cargo test`)
- CI — `cargo clippy`, `cargo fmt --check`, ESLint, and Prettier checks
- Homebrew Cask distribution (`brew install --cask bemindlabs/liteduck/liteduck`)
- Favicon.svg and link in index.html

### Changed
- Regenerated all app icons from source (iOS, macOS `.icns`, Windows `.ico` + Store logos)
- Ignored `src-tauri/gen/`

## [0.1.2] - 2026-03-31

### Changed
- **Rebrand** — renamed from DevCanvas / AI-DLC to LiteDuck across all surfaces
  - Tauri config: productName, identifier (`com.bemindlabs.liteduck`), window title
  - Cargo.toml package name (`bemind-liteduck`); package.json name (`bemind-liteduck`)
  - UI text: sidebar, footer, wizard, get-started

## [0.1.1] - 2026-03-31

### Changed
- Version bump across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json

## [0.1.0] - 2026-03-28

Initial public release. (At this point the product was the LoopDuck-era AI workspace; the
sections below preserve the capabilities that carried forward into the editor-only LiteDuck.)

### Terminal
- Embedded PTY terminal with full xterm.js rendering (WebGL renderer)
- Multiple concurrent terminal sessions with tab management
- Split-pane support
- tmux-backed sessions with tab-name mapping
- Terminal resize synced to the PTY backend

### File Browser
- Directory listing with metadata (size, modified date, type)
- Text file reading and editing
- File preview (code, images, markdown)
- Tree-view navigation

### Git (libgit2)
- Working-tree status (staged / unstaged / untracked)
- Commit log with author, message, and hash
- Working-directory and per-commit diffs
- Branch listing (local + remote) and current-branch detection
- Stage / unstage individual files or all changes
- Commit, push, and discard changes
- Worktree management

### Settings & Security
- Local settings store (later moved to JSON config; SQLite kept as a runtime index)
- OS keychain integration for secrets (Apple Keychain, Windows Credential Manager, libsecret)
- Biometric authentication (Touch ID)
- Device identity generation

### UI / UX
- Dark-themed interface built with Tailwind CSS v4
- Resizable panel layout (react-resizable-panels)
- React Router v7 client-side navigation
- Command palette and keyboard shortcuts
- Notification center and error boundaries

### Production Build & Distribution
- Tauri v2 auto-updater configured against GitHub Releases
- Bundle targets: deb, rpm, appimage (Linux); nsis, msi (Windows); dmg, app (macOS)
- macOS minimum deployment target: Ventura
- GitHub Actions release workflow with matrix builds (macOS aarch64/x86_64, Windows, Linux)
- `scripts/build.sh` — single-command production build
- `scripts/bump-version.sh` — atomic version bump across package.json, Cargo.toml,
  tauri.conf.json

_Also shipped in 0.1.0 (removed in the editor-only refocus): AI chat & agents, the OpenClaw
gateway, A2A and MCP integration, the Scrum/DLC project-management surfaces, and the GitHub,
Docker/Compose, SSH/SFTP, and LAN-chat integrations. See **[Unreleased]**._

---

[2026.4.14]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.12...v2026.4.14
[2026.4.12]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.11...v2026.4.12
[2026.4.11]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.8...v2026.4.11
[2026.4.8]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.6...v2026.4.8
[2026.4.6]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.4...v2026.4.6
[2026.4.4]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.3...v2026.4.4
[2026.4.3]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v2026.4.2...v2026.4.3
[2026.4.2]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v0.1.4...v2026.4.2
[0.1.4]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/bemindlabs/openclaw-loop-duck-app/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bemindlabs/openclaw-loop-duck-app/releases/tag/v0.1.0
