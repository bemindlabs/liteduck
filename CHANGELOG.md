# Changelog

All notable changes to LiteDuck are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Calendar Versioning](https://calver.org/) (YYYY.M.D).

---

## [Unreleased]

## [2026.5.2] - 2026-05-02

### Fixed
- **GitHub integration restored** — Settings → GitHub auth check, repo list, branches, issues, PRs, and workflow runs now work end-to-end. They had been silently failing inside the app: TLS handshakes panicked on a tokio worker thread while the main UI kept running, so the breakage was invisible without log inspection. `github_clone_repo` was unaffected (it shells to the system `git` CLI).
- **All in-app HTTPS paths** — same root cause affected any rustls-using path (OpenClaw chat gateway, websocket TLS, and Docker-over-TLS in some configurations).

### Changed
- Install rustls' default crypto provider (`aws_lc_rs`) at process startup via `CryptoProvider::install_default()`. Multiple TLS deps (`reqwest`, `octocrab`, `tokio-tungstenite`, `russh`, `bollard`) all pulled rustls 0.23 with conflicting/no provider features, so no provider was auto-selected. The call is wrapped in an explicit `match` so the "already installed" branch (the only error mode in rustls 0.23, e.g. on dev hot-reload) is a documented no-op, and any future rustls error variant surfaces via `stderr` at startup instead of being silently swallowed.

## [2026.4.22] - 2026-04-22

## [2026.4.16] - 2026-04-16

### Added
- **AI activity indicator** — centered activity indicator in the header showing real-time AI processing status
- **Coding automation auto-seed** — AgentsSCRUM auto-seeds coding automation and surfaces failures to the UI
- **FIFO queue with parallel lanes** — coding workflow now supports queued execution with configurable parallel lanes
- **Pipeline timeline UI** — frontend timeline visualization and runs history page for pipeline executions
- **Unified pipeline store** — dual-emit legacy pipelines into unified execution store with AiGateway migration

### Fixed
- **Coding workflow persistence** — automation runs persisted correctly; tokens scrubbed from stored data; templates hydrated properly
- **Scrum workspace hint** — workspace hint propagated correctly; JSON-escape template values to prevent parse errors
- **Story status alignment** — board column statuses aligned with story statuses; Agents Council UX improvements
- **Automations form** — coding_workflow action type wired through the automation form UI
- **Clippy lint** — resolved doc-list-item lint warning in pipeline module

### Changed
- **Pipeline execution backbone** — unified execution model replacing fragmented per-module runners; migrated to AiGateway
- **Coding workflow tests** — restored mocks for resume-from-disk and pipeline IPC scenarios

## [2026.4.14] - 2026-04-14

### Added
- **Internal MCP** — in-process service registry enabling all 11 backend modules to discover, call, and sync with each other via a standardized MCP interface (`src-tauri/src/internal_mcp/`, 19 files)
  - `McpToolProvider` trait with 11 providers exposing 41 tools (git, scrum, agents, agents_scrum, coding_workflow, chat, memory, docker, files, settings, openclaw)
  - `InternalMcpRegistry` — RwLock-based concurrent tool discovery and dispatch with dot-separated naming (`provider.tool_name`)
  - `InternalMcpBus` — pub/sub for resource change notifications with URI pattern matching, auto-bridges to Tauri event `internal-mcp-resource-changed`
  - External MCP bridge on `127.0.0.1:18790` — JSON-RPC 2.0 over HTTP for Claude Desktop, Cursor, and other external AI agents
  - 5 Tauri commands: `internal_mcp_list_providers`, `internal_mcp_list_tools`, `internal_mcp_call_tool`, `internal_mcp_list_resources`, `internal_mcp_read_resource`
  - TypeScript frontend: `src/lib/internal-mcp.ts` (IPC wrappers) + `src/hooks/useInternalMcp.ts` (`useInternalMcp()` and `useResourceWatch()` hooks)
  - 15 unit tests across registry, bus, and bridge modules
  - Terminal MCP provider with session listing, creation, and command execution tools; publishes `terminal://sessions` on state changes
- **Automation execution engine** — `automations_runner.rs` for scheduled task execution; `orchestrator.rs` for cross-module bus-triggered automation chains; Internal MCP provider exposing automation tools; `CronBuilder` and `ExecutionLogModal` UI components
- **Unified ExecutionStatus** — shared enum across coding workflow, dev task, and scrum modules for consistent status tracking
- **Shared memory bridge** — `shared_memory.rs` module injecting relevant memory notes into SCRUM orchestrator and Chat system prompts; extracts memory candidates from AI responses via pattern-based heuristics; settings section for memory sharing configuration
- **Group mentions in team chat** — `@all` (all agents + LAN peers), `@agents` (all agent buddies), `@buddy` (selected buddies); mention autocomplete suggestions with color-coded badges; inline highlight rendering in chat bubbles
- **AgentsSCRUM session summary and progress** — `SessionSummaryPanel` with story details, vote breakdown, and discussion threads; `PhaseProgress` bar, `PhaseHint`, and `JsonPreview` components
- **Council ↔ Workflow bridge** — `dev_task_start` accepts optional `scrum_session_id`; story results written to `session.dev_executions` in real-time; auto-advance DevMode → Review on batch completion
- **AI Epic generator** — generate epics from natural language prompts via OpenClaw gateway (New Epic modal)
- **AI Story generator** — generate stories from natural language prompts via OpenClaw gateway (New Story modal)
- **AI Backlog generator on Epics tab** — "Generate from AI" button on the Epics tab
- **Live DiscussionPanel** — wired into AgentsSCRUM PhaseContent for real-time agent deliberation display (LD-55)
- **Biometric gate and lock screen** — backend `BiometricGateState` blocks secret access when locked; `useIdleTimer` hook auto-locks after configurable inactivity; `BiometricLockScreen` full-screen overlay with native unlock
- **Launch Agent page** — responsive agent launcher with CLI presets, workspace agent buddies, and A2A remote agent discovery
- **Settings danger zone** — reset all settings and clean data actions
- **Settings: 10 missing config fields exposed** — General: font family, font size, sidebar position, terminal shell, scrollback lines; AI: default model, streaming toggle, temperature, max tokens; Biometric: idle timeout picker
- **Design system reference** — Tokens Studio JSON for Figma import (`.design/tokens.json`) and visual HTML reference page (`.design/design-system.html`)
- **Unified notification system** — process-wide notifications for AgentsSCRUM, Coding Workflow, SSH, GitHub, and Run All Stories events
- **Run All Stories completion summary** — post-execution panel showing success/fail counts, elapsed time, and error details
- **Session-lifetime secret cache** — OS keychain secrets cached for entire app session; `preload_secrets` fetches all at startup so the password dialog appears only once
- **`openclaw_api_key` in AI settings** — Legacy API key field exposed with individual clear capability
- **Memory provider** — 6 tools (search, list, read, create, update, delete) for workspace and global memory access via Internal MCP
- **Missing event listeners** — added `onScrumSessionStarted()` and `onScrumSessionCancelled()` frontend listeners
- **Tmux window operations** — create, rename, close, and switch tmux windows from the terminal UI; improved session management with window-aware tab display

### Changed
- **git.rs refactored** — business logic extracted into `_inner` functions; Tauri commands are now thin wrappers
- **CodingWorkflowState** — added `get_status()` and `status_arc()` public methods for cross-module access
- **Coding workflow MCP publishing** — publishes `coding_workflow://status` on progress and completion via Internal MCP bus
- **Scrum resource sync** — story create, update status, and delete now publish `scrum://stories` change notifications via Internal MCP bus
- **AgentsSCRUM event sync** — phase transitions and session completion now publish `agents_scrum://sessions` change notifications
- **AgentsSCRUM session lifecycle** — sessions persisted to disk immediately on creation; cancelled sessions persisted for history; credential recovery from keychain on resume after restart
- **AgentsSCRUM wave results** — `execute_wave` writes `StoryResult` to `session.dev_executions` and persists to disk
- **AgentsSCRUM default model** changed from `anthropic/claude` to `openclaw`
- **Rename Backlog to Plan** in scrum board UI labels
- **Rename Deploy to Done** in scrum board columns for manual deployment workflow
- **Gateway URL default** changed from `localhost:3000` to `127.0.0.1:18789`
- **Settings reads from config.json** — `get_settings` (bulk) and `save_setting` now use config.json instead of only SQLite
- **Settings sidebar grouped by scope** — Project-scoped items first under "Project" header; Global items under "Global" header
- **`telegram_bot_token` moved to SECRET_KEYS** — now consistently stored in OS keychain
- **SessionSummaryPanel error feedback** — surfaces error messages in a visible banner instead of swallowing silently
- **Modernized UI** — agent cards with hover lift and shadows, StoryCard and KanbanColumn visual effects, dialog modals with shadow and entrance animations, landing page visual polish, improved Markdown rendering, terminal tab enhancements
- **ConfirmDeleteDialog** — merged duplicate delete dialogs into a single reusable component

### Fixed
- **AgentsSCRUM consensus** transitions to HumanApproval instead of getting stuck
- **AgentsSCRUM status** loads sessions from disk after app restart
- **Agents Council** loads epics from Scrum board instead of empty array
- **Council profile loading** searches workspace, global, and .LiteDuck agent directories
- **DiscussionPanel** renders without session data, eliminates "Waiting for session data" flash
- **Token loss on app restart** — gateway token recovered from keychain; session persisted before first phase
- **Dev execution results lost** — now writes to `session.dev_executions` for Review phase from both wave and dev-task paths
- **Generate Backlog** — restructured prompt to prevent agent interception; retry with stronger JSON-only prompt on parse failure; surface gateway errors instead of generic parse error
- **Gateway error messages** improved, especially for HTTP 500
- **Ask AI** falls back to non-streaming when stream returns empty
- **Config.json writes** serialized to prevent corruption from concurrent saves
- **Chat stream** uses `app.emit` instead of `window.emit` for reliable delivery
- **Chat sessions not workspace-scoped** — sessions reload on workspace switch; `AskAI` passes workspace from context
- **Chat message persistence** — incoming messages for inactive chats now saved; silent catches replaced with `logger.warn()`; workspace validated before backend save
- **@all/@agents unbounded fan-out** — group mentions now batch agent requests (max 3 concurrent)
- **ChatPage AI requests stateless** — added session key for per-agent-per-chat context
- **Stale AI response on chat switch** — pending AI request cancelled when user switches active chat
- **Wizard workspace context** — workspace context updated immediately on wizard finish
- **Workspace init** no longer fails when bundled resources dir is missing
- **Terminal agent launch**, Ask AI settings lookup, and hook dependency fixes
- **Terminal agent window** not filling full width
- **GROUP_MENTION_RE** — removed `g` flag to prevent `lastIndex` mutation on `.test()`

## [2026.4.12] - 2026-04-12

### Changed
- **Remove bundled resource templates** — deleted AGENTS.md, CLAUDE.md, GEMINI.md from src-tauri/resources; workspace init now only creates .LiteDuck directory structure
- **Rename DevCanvas Templates → Workspace Structure** in Settings with .LiteDuck subdirectory descriptions
- **Wizard pre-populates existing settings** — all 4 steps (workspace, gateway, GitHub, scrum) now load saved values on mount
- **Gitignore templates** — added "None (minimal)" option, .LiteDuck included in all templates, default changed from Node.js to None
- **Standardize .LiteDuck casing** — all documentation and code references use PascalCase; added .liteduck → .LiteDuck migration on case-sensitive filesystems

### Fixed
- **PR #38 review comments** — 12 Copilot findings addressed: security (redact raw AI response), stale closures, z-index consistency, React key stability, scrum path mismatch, secret cache TTL reduced to 1h, GitHubMark rename
- **Release workflow** — tag-vs-config version validation prevents mismatched releases; upgraded action-gh-release v2 → v3 (Node.js 20 deprecation)
- **Merge conflict** — resolved CHANGELOG and README divergence between main and develop

## [2026.4.11] - 2026-04-12

### Added
- **Agents SCRUM** — AI council of 3–9 specialist agents (Tech Lead, Senior Dev, QA, Security, UX, DevOps, PO) with 8-phase deliberation pipeline: Intake → Decomposition → Refinement → Estimation → Consensus → Dev Mode → Review → Retrospective
- **Orchestrator** — async phase chaining via OpenClaw AI gateway with prompt builders, response parsers, and real-time Tauri event emissions
- **Dev Mode engine** — wave-based parallel story execution with git branch creation, test running, and bounded concurrency via `tokio::JoinSet`
- **Council profiles** — `agents/council-*/profile.md` read at runtime for name, icon, role, and system prompt (hardcoded fallback)
- **ReviewSummaryPanel** — per-agent review verdicts with color-coded badges and findings list
- **RetrospectivePanel** — 3-column layout (went well, to improve, action items) with category badges
- **Coding workflow step refinement** — inline prompt input per step; user types refinement feedback, AI regenerates the step
- **6 Tauri events** for Agents SCRUM real-time updates: phase-changed, agent-message, estimation-vote, consensus-vote, dev-progress, session-complete
- **Composable pipeline builder** — 11 built-in phase blocks, 3 presets (full-scrum, fast-track, spike), custom pipeline validation
- **~/.LiteDuck Application Home Directory** — global config.json, profile.md, workspaces.json, cross-workspace memory graph, global agent profiles, template resolution, MCP server registry, config merge strategy, LITEDUCK_HOME env override, migration wizard
- **Workspace-scoped data isolation** — `.LiteDuck/` directory per workspace for scrum, agents, chat, automations, MCP; switching workspaces changes visible data for all features
- **Settings page redesign** — 17 modular section components (<300 lines each), `useConfig()` reactive hook, `useDebouncedSave` auto-save, `useFieldValidation` inline errors
- **File-based automation storage** — workspace-scoped JSON files with run history, toggle, and run commands; SQLite DB deprecated
- **Automation workspace scoping** — `workspace` column added to automations DB; AutomationsPage filters by active workspace
- **MCP workspace scoping** — McpSection passes workspace to list/save commands
- **Setup Wizard** expanded to 6 steps — Workspace directory selection (step 2) and Scrum process configuration (step 5: sprint duration, Definition of Done, team members)
- **Scrum Settings section** — dedicated settings panel for editing sprint defaults, DoD checklist, and team roster post-setup
- **Per-workspace wizard trigger** — wizard automatically opens when switching to a workspace that hasn't been configured yet (`wizard_completed_workspaces` tracking)
- **Splash screen** — 1-second branded splash with dark/light theme awareness on first load
- **Centralized logger** — `createLogger()` utility replacing `console.*` across the codebase
- **Vite code splitting** — React.lazy route-level splitting and manual vendor chunks for faster cold start
- **16 new test files** for previously untested lib modules (LD-77, LD-78)

### Changed
- **HTTP connection pooling** — single static `reqwest::Client` via `OnceLock` replaces 18 per-call `build_client()` invocations; eliminates TLS handshake overhead (~3s saved per workflow)
- **SQLite connection pooling** — single shared connection via `OnceLock<Mutex<Connection>>` replaces 63 per-command `db::open()` calls across 9 files
- **Config cache** — `read_config()` and `resolve_config()` cached in memory with 5-minute TTL; invalidated on write
- **Async session storage** — `save_session_json`, `load_session_json`, `list_sessions`, `delete_session` wrapped with `tokio::spawn_blocking`
- **Parallel file execution** — consecutive `create_file`/`edit_file` workflow steps grouped into batches and executed concurrently via `JoinSet`
- **settings.db deprecated** — eager `db::open()` removed from app startup; `get_setting_v2()` reads config.json first (cached), falls back to SQLite for unmigrated keys
- **AgentsScrumPage** — replaced mock data with live Tauri integration (start session, run phase, event listeners, previous sessions list)
- **Scrum board** — `projectList()` now passes workspace parameter to filter by active workspace
- **Dependency upgrades** — Vite 8, React 19.2, React Router 7.14, rusqlite 0.39, russh 0.60, git2 0.20, reqwest 0.13
- **LandingPage** refactored into modular components
- **Resource template** (`src-tauri/resources/CLAUDE.md`) rewritten from a generic placeholder to a project-aware LiteDuck workspace template
- **Page and component extraction** — monolithic pages split into modular subdirectories under `src/pages/<domain>/` and `src/components/<domain>/`

### Fixed
- Scrum board showing all projects across workspaces instead of filtering by active workspace
- MCP server configs not scoped to workspace
- `cargo fmt` in `liteduck-core` crate (long assert lines)
- Clippy warnings: `drain_collect`, consecutive `str::replace`, `useless_format`, `collapsible_if`, `&PathBuf` → `&Path`, derivable `Default` impl
- Chat tests updated to match workspace-scoped session API
- Dev mode doctest converted to text block (unresolved crate import)
- ESLint floating promises and unnecessary conditionals in AgentsScrumPage
- **Settings invoke timeout** — added HTTP timeouts and increased IPC tolerance to prevent "Saving..." hang
- **Splash screen** dark/light theme awareness
- **Windows icon** — converted icon.ico to proper ICO format for Windows builds
- **Release workflow** — tag-vs-config version validation, upgraded action-gh-release to v3.0.0

## [2026.4.8] - 2026-04-08

### Added
- **iOS Tauri app** — full Tauri v2 iOS support with edge-to-edge WebView, native `contentInsetAdjustmentBehavior` fix, safe area handling
- **Mobile responsive layout** — CSS `min()` fallbacks for modals/tabs, `sm:` breakpoints for smooth transitions, responsive Kanban gaps
- **Mobile sidebar UX** — slide animation (CSS transforms), swipe-to-open/close gestures, haptic feedback on open, 44px touch targets
- **AskAI mobile overlay** — full-screen slide-up panel on phones (<768px) with header bar and close button; desktop side panel unchanged
- **Coding Workflow** — AI-powered multi-step plan generation, step editor, workflow persistence (SQLite)
- **Shared Xcode workspace** — `mobile/LiteDuck.xcworkspace` referencing Tauri iOS + watchOS projects with combined Makefile
- **watchOS app icons** — 13 icon sizes generated from mascot SVG
- **Dynamic app version** — `getAppVersion()` falls back to Tauri API on iOS where updater module is excluded
- **Theme-color meta** — dark/light `<meta name="theme-color">` tags + body background synced on theme toggle

### Changed
- **App icons** — all icons (desktop, iOS, Android, watchOS, Windows Store) regenerated from `liteduck-mascot.svg`
- **Footer version** — dynamic in all 3 locations (App.tsx, GetStartedPage, LandingPage); removed hardcoded "v0.1.0"
- **ChatPage** — sidebar becomes full-screen overlay on mobile instead of 224px side panel
- **AgentsPage** — modal dialogs capped at `min(XXXpx, 90vw)` with `max-h-[85vh]` scroll
- **LandingPage** — Quick Access grid `grid-cols-2` on phones, reduced padding for mobile
- **NotificationsPage** — filter pill font `text-[11px]` on mobile, `min-h-[36px]` touch targets
- **SettingsPage** — SSH and GitHub sections hidden on iOS via `hasNativeCapabilities()` guard
- **Header** — hamburger icon enlarged to `h-5 w-5` with `min-h-[44px] min-w-[44px]` touch target
- **Viewport meta** — removed `user-scalable=no` and `maximum-scale=1.0` for accessibility
- **CI workflow** — cargo fmt/clippy/test now run from workspace root with `--workspace` flags

### Fixed
- **Bottom space on iOS** — disabled WKWebView automatic safe area content inset via Rust `objc2` FFI
- **iOS window background** — set to dark `#0f0b16` to match dark theme, body background synced dynamically
- **watchOS deployment target** — lowered from 26.0 to 10.0 for compatibility with watchOS 11.x devices
- **Release build** — guarded `open_devtools()` behind `#[cfg(debug_assertions)]`
- **CI disk space** — resolved exhaustion during `cargo test`
- **Firestore rules** — user root doc match, immutable userId on write, workspace subcollection membership via `get()`
- **WearOS** — removed unused imports in WearNavigation.kt and HomeScreen.kt
- **E2E tests** — terminal tab count assertion changed from exact to relative

### Removed
- **Native iOS app** (`mobile/ios/`) — replaced by Tauri iOS app
- **Stale scrum data** (`.LiteDuck/`) — orphaned automation and scrum files

## [2026.4.6] - 2026-04-06

### Fixed
- **Release workflow** — macOS builds failing with "specified item could not be found in the keychain" due to GitHub Actions `if:` conditions unable to read step-level `env:` blocks; moved secret checks into shell guards
- **Code signing gate** — `APPLE_SIGNING_IDENTITY` and `APPLE_ID*` env vars are now only exported when `APPLE_CERTIFICATE` is also configured, preventing "sign with empty identity" failures
- **Notarization verification** — same `if:`-condition fix applied to the notarization verify step

## [2026.4.4] - 2026-04-03

### Changed
- **ESLint** — stricter TypeScript rules, `eslint-plugin-unused-imports`, refactors (`truncate-path`, `mini-duck-colors`, `useReadingSettings`, and related UI cleanup)
- **CI / Release** — workflow `permissions`, pinned actions (`tauri-action` v0.6.2, `action-gh-release` v2.6.1, `rust-cache` v2.9.1), macOS signing `base64 -d`, publish step `tag_name`

### Fixed
- **Scrum** backlog generation: session key without non-null assertion; **Landing** GitHub repo load cancellation via `AbortController` (strict lint–safe)
- **ReadingView** heading scroll, **Settings** diagnostics props, and Prettier drift on `SettingsPage`
- **Rust**: Clippy `items_after_test_module` (`device_identity`), `bool_assert_comparison` (`openclaw` tests)

## [2026.4.3] - 2026-04-03

### Added
- **Skills Browser** (LOOP-18) — browse and install OpenClaw skills ([#26](https://github.com/bemindlabs/openclaw-loop-duck-app/pull/26))
- **Plugin management** UI — enable/disable gateway plugins (LOOP-19, [#27](https://github.com/bemindlabs/openclaw-loop-duck-app/pull/27))
- **Doctor** — OpenClaw gateway diagnostics and auto-fix (LOOP-28, [#28](https://github.com/bemindlabs/openclaw-loop-duck-app/pull/28))
- **Model switcher** — list and select AI models in the Ask AI panel (LOOP-22, [#31](https://github.com/bemindlabs/openclaw-loop-duck-app/pull/31))
- Agents: **multi-select**, **bulk quick actions**, **drag-to-reorder** cards; inline Ask AI **streaming** responses
- Agent cards: **MiniDuck** thumbnail, last-active time, hover animations
- **Git worktrees** — backend commands (list, add, remove, prune) and Git page list/status
- **Workspace quick switcher** in header; workspace **context provider**; reactive updates when switching workspace
- **Tmux** session mode for new terminals; **session picker**; kill/destroy tmux session from the terminal UI
- Ask AI: **multi-turn** context, **workspace-aware system prompt**, **persisted chat history** (SQLite)
- Agents: **workspace directory** selector and filesystem integration; structured **profile / memory / tasks**
- Wizard **step 2** — OpenClaw gateway configuration; Get Started **OpenClaw** guides and version compatibility table
- Scrum board: **Local vs Jira** data source toggle; **workspace-scoped** project isolation
- Landing: **GitHub clone** dialog (repo dropdown + URL parsing); Settings: **clone parent folder**, clearer GitHub token copy
- Keychain: **`get_secrets` batch** command for settings
- **Release / quality** infrastructure — production build pipeline, Vitest coverage expansion (lib batches), Playwright settings alignment

### Changed
- Scrum / Kanban workflow refresh: **Local/Jira** data-source toggle on the board and follow-up cleanup of legacy Jira coupling in the streamlined Kanban path
- **DLC** product surface removed — DLC page and frontend module, Scrum DLC markdown + related Tauri commands, and DLC references in shortcuts/notifications
- App menu / sidebar: **Terminal** first under Development; **GitHub** entry in the app menu
- Workspace API: standardized **`workspace_directory`** naming (replacing `workspace_path` usage)
- **CI / Release**: GitHub Actions on Node 24–compatible action majors; release jobs on `ubuntu-latest`; **quality gate** job (`npm run quality-gate` + version sync) before platform builds

### Fixed
- Gateway integration regressions ([#30](https://github.com/bemindlabs/openclaw-loop-duck-app/pull/30))
- macOS **Edit** menu — native `PredefinedMenuItem` so Cmd+C / Cmd+V work reliably
- Gateway URL **normalization** and clearer HTTP error messages
- FilesPage AI: read **`openclaw_token`** via secrets/keychain path
- Dev: **agent-card.json** fallback path when loading agent card assets
- Agents: Copilot / PR follow-ups — selection sync, bulk actions, timestamps; Clippy `too_many_arguments` on `agents_update`
- `.gitignore`: Playwright **`playwright-report/`**, **`test-results/`**, **`blob-report/`**

## [2026.4.2] - 2026-04-02 — Developer Preview

### Added
- **Team Chat** — BLE mesh routing, persistence, and transport manager
- **Agent memory system** with OpenClaw mascot component and QA-tester agent
- **Dev task system** with agents working view and workspace rules
- **Session management** — kill session command and backlog session reuse
- **Auto-update checker** with GitHub releases integration
- **Focus mode** toggle (Cmd+Shift+F) via command palette
- **Native Edit menu** and improved Help menu with clipboard key handlers
- **Embedded browser** in main window using Tauri multi-webview
- **Jira bidirectional sync** — migrated to Jira API v3 search/jql
- **FilePreview** expanded format support and improved UX
- **File logger** and improved OpenClaw error messages
- **Playwright e2e** test setup
- Homebrew cask auto-update step in release workflow
- Mirror release assets to public `bemindlabs/liteduck-releases` repo

### Changed
- **Versioning switched from SemVer to CalVer** (YYYY.M.D) — aligned with OpenClaw release strategy
- Extracted reusable Select UI component, replaced all native `<select>` elements
- Merged READ mode into DOCS mode (distraction-free reading)
- Renamed `.devcanvas` to `.LiteDuck` across backend and frontend
- Updated icons, configs, app pages, and project tooling
- Coverage thresholds updated to match current coverage levels

### Fixed
- PTY session now stays alive after command completes
- AskAI panel resize stale closure and widened grab target
- Browser page navigation, XSS protection, and backend cleanup
- Clippy warnings: added Default impl and used `clamp()`
- Ref updates moved to `useEffect` to satisfy react-hooks/refs lint
- Gated `chrono::Utc` import behind BLE platform cfg for CI
- ESLint warnings and Prettier formatting across codebase

## [0.1.4] - 2026-04-01

### Added
- CLAUDE.md for Claude Code context
- Mac App Store distribution with signed .pkg and entitlements
- App Store upload script (`scripts/appstore-upload.sh`)
- App Store button on website product page and get-started page
- `appStoreUrl` field in Product interface for store links
- macOS Xcode project with full icon set (iOS + macOS)
- Claude Code hooks (`.claude/hooks/`) for type-checking, pre-commit, pre-push, and version sync
- Cross-platform builds: macOS aarch64 + x64 DMGs, Windows, Linux via CI

### Changed
- Comprehensive README with feature tables, architecture map, and install options
- Updated release workflow with correct permissions and CHANGELOG URL
- Switched direct distribution from .pkg back to .dmg (standard macOS UX)
- Homebrew cask includes `postflight` xattr fix for Gatekeeper
- Website homepage highlights updated to mention Mac App Store availability

### Fixed
- TypeScript strict mode fixes (FilePreview, GitPage, WizardPage, DockerPage)
- Notification type corrections in useTerminal (`"error"` → `"system"`)
- Keychain error handling for Linux CI (DBus/Platform secure storage)
- SSH agent gated behind `#[cfg(unix)]` for Windows build compatibility
- Linux CI: removed deprecated `libappindicator3-dev`, added `libdbus-1-dev`
- Release workflow: `contents: write` permission on build job
- Homebrew cask SHA256 and .ico only contained single 16x16 icon (flagged)

## [0.1.3] - 2026-03-31

### Added
- Quality gates: `.githooks/` with pre-commit (`cargo check`) and pre-push (`tsc` + `vite build` + `cargo test`)
- CI: `cargo clippy`, `cargo fmt --check`, ESLint, and Prettier checks
- Homebrew Cask distribution (`brew install --cask bemindlabs/liteduck/liteduck`)
- Favicon.svg and link in index.html

### Changed
- Regenerated all app icons from source (iOS, macOS .icns, Windows .ico + Store logos)
- Ignored `src-tauri/gen/` directory

## [0.1.2] - 2026-03-31

### Changed
- **Rebrand:** Renamed from DevCanvas / AI-DLC to LiteDuck across all surfaces
  - Tauri config: productName, identifier (`com.bemindlabs.liteduck`), window title
  - Cargo.toml: package name (`bemind-liteduck`), description
  - package.json: name (`bemind-liteduck`)
  - UI text: sidebar, footer, wizard, get-started, AskAI system prompt
  - Agent card, changelog, build script, release workflow
  - Resources: CLAUDE.md, .codex/instructions.md
- Added vendored OpenSSL dependency

## [0.1.1] - 2026-03-31

### Changed
- Version bump across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json

## [0.1.0] - 2026-03-28

Initial public release of LiteDuck (AI Coding workflow), a
cross-platform desktop application built with Tauri v2 + React 19 that
integrates OpenClaw AI agents into every stage of the software development
life cycle.

### Features

#### AI Chat & Agents
- OpenClaw gateway integration with connection health check and agent catalogue
- AI chat message dispatch per agent with streaming responses
- Agent profiles with persistent memory and task management
- Agent-to-Agent (A2A) protocol support
- MCP server integration with SSE transport

#### Terminal
- Embedded PTY terminal with full xterm.js rendering (WebGL renderer)
- Multiple concurrent terminal sessions with tab management
- Split pane support
- tmux-backed sessions with tab name mapping
- Terminal resize support synced to the PTY backend

#### Scrum / Project Management
- Projects: create, list, update, delete
- Epics: full CRUD with status transitions
- User stories: CRUD, status, story-point estimation, assignee
- Sprints: create, start, close, delete; add/remove backlog items
- Tasks: CRUD with status tracking
- Kanban board view per sprint with drag-and-drop (dnd-kit)
- Burndown and velocity charts
- AI-powered backlog generation from natural language prompts

#### DLC Phase State Machine
- Six SDLC phases: Planning, Design, Implementation, Testing, Deployment, Maintenance
- Phase transitions validated server-side in Rust
- Per-phase story filtering
- Full phase history log

#### GitHub Integration
- Personal-access-token authentication stored in the OS keychain
- Repository listing and branch enumeration
- Issue listing and creation
- Pull-request listing and creation
- Repository clone via libgit2

#### Docker / Docker Compose
- `docker compose up / down / build / logs / ps` commands via Bollard
- Live container listing with status
- Per-container resource stats (CPU, memory)
- Container log streaming and lifecycle actions
- Compose stack management
- Image listing
- Docker daemon connection health check

#### File Browser
- Directory listing with metadata (size, modified date, type)
- Text file reading and editing
- File preview (code, images, markdown)
- Tree view navigation

#### Git (libgit2)
- Working-tree status (staged / unstaged / untracked)
- Commit log with author, message, and hash
- Working-directory and per-commit diffs
- Branch listing (local + remote) and current branch detection
- Stage / unstage individual files or all changes
- Commit, push, and discard changes
- Worktree management

#### SSH / SFTP
- Remote server connections via russh
- SSH terminal sessions
- SFTP file transfer

#### LAN Chat
- Peer-to-peer team chat for local network collaboration

#### Automations
- Automation templates for common development tasks

#### Settings & Security
- SQLite-backed settings store (local data directory)
- OS keychain integration for secrets (Apple Keychain, Windows Credential Manager, libsecret)
- Biometric authentication (Touch ID)
- Device identity generation

#### UI / UX
- Dark-themed interface built with Tailwind CSS v4
- Resizable panel layout (react-resizable-panels)
- React Router v7 client-side navigation
- Command palette and keyboard shortcuts
- Notification center
- Error boundaries

#### Production Build & Distribution
- Tauri v2 auto-updater configured against GitHub Releases
- Bundle targets: deb, rpm, appimage (Linux); nsis, msi (Windows); dmg, app (macOS)
- macOS minimum deployment target: Ventura
- GitHub Actions release workflow with matrix builds for macOS aarch64/x86_64, Windows, and Linux
- `scripts/build.sh` — single-command production build
- `scripts/bump-version.sh` — atomic version bump across package.json, Cargo.toml, and tauri.conf.json

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
