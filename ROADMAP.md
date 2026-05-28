# LiteDuck Roadmap

> A lightweight, focused code editor — fast, native, and out of your way.

**Latest release:** 2026.5.2 (CalVer)
**Platforms:** macOS-first (Homebrew) — Windows & Linux planned

LiteDuck is an **editor-only** desktop app: a file browser + editor, an integrated
terminal, Git, Settings, and a manifest-based plugin system (the sanctioned extension
point — integrations live in plugins, never in core). The core has no AI/LLM, agents,
chat, or cloud services — and this roadmap keeps it that way. Every item below sharpens
the core editing experience or the reliability of the native app beneath it.

> **Scope guardrail.** Features that would reintroduce AI, autonomous agents, remote
> orchestration, or always-on cloud services are explicitly out of scope. See
> [VISION.md](VISION.md) and [ADR-001](docs/adr-001-single-direction.md).

---

## In Progress

Current focus: harden the editor core before adding surface area. Finish P0 before
pulling from P1.

### P0 — Must ship

- **Reliability hardening** — Convert remaining `panic!()`/bare `unwrap()` crash paths
  in the Rust backend to `Result`; separate genuine crash risks from safe defaults via
  `clippy::unwrap_used`.
- **Test coverage backfill** — Unit tests for the four editor surfaces (Files, Terminal,
  Git, Settings) and their IPC wrappers; raise Vitest thresholds incrementally toward 70%.

### P1 — Should ship

- **Lint & format cleanup** — Clear outstanding ESLint errors (catch-block types, floating
  promises) and Prettier drift across the frontend.
- **E2E in CI** — Wire the Playwright specs in `e2e/` into the quality gate, covering the
  first-run wizard and the core editor flows.

### P2 — Nice to ship

- **Editor polish** — Keyboard-shortcut parity across platforms, focus-mode refinements,
  and command-palette coverage for every action.

---

## Planned

Near-term priorities grouped by area, roughly in delivery order.

### Editor & Files

- **Multi-file editor tabs** — Open several files at once with a tab strip, dirty-state
  indicators, and quick-switch.
- **Find / replace** — In-file search and replace, plus project-wide "find in files".
- **Preview & highlighting** — Broader language syntax highlighting and richer
  markdown/image preview.

### Terminal

- **Terminal UX** — Split-pane and full-view (maximize) polish; configurable
  shell/profile per workspace.

### Git

- **Writable Git workflow** — Stage / unstage, commit, push, and discard from the
  Changes view. Requires the write-capable `git2` IPC commands (`git_add` /
  `git_reset` / `git_commit` / `git_discard_file`) the current read-only surface lacks.
- **Multi-root & submodules** — Support workspaces with multiple `.git` roots and
  submodules; a repository switcher scoping status, diff, log, and staging to the
  selected repo.
- **Diff & history polish** — Side-by-side diffs and per-hunk staging.

### Quality & Security foundations

- **Supply-chain audit in CI** — Add `cargo audit` / `cargo deny` and keep `npm audit`
  in the quality gate.
- **Shell-command validation** — Extend `bash_validator.rs` to detect shell-metacharacter
  injection (`$()`, backticks, `;`, `&&`, `|`), not just classify command intent.
- **Secret-handling docs** — Document the keychain cache, the PLAIN/SECRET key split, and
  the biometric-gate interaction in one place.

### Platform

- **Windows & Linux parity** — Native window chrome, Cmd→Ctrl shortcut mapping, font
  rendering, and platform keychain integration.

---

## Future Horizons

Directions, not commitments — all within the editor-only charter.

- **Themes & customization** — User-defined color themes and editor settings.
- **Workspace sessions** — Restore open files, terminal tabs, and layout per workspace.
- **Extensible file preview** — Pluggable preview renderers for more file types.
- **Performance budget** — Cold-start and memory targets tracked release over release.

---

## Shipped

### Editor & workspace

- File browser with tree view, inline editing, and preview (code, images, markdown);
  new file/folder; open in VS Code.
- Workspace quick switcher and a workspace context shared across the app.
- First-run setup wizard (dev mode, workspace, initial project).
- Splash screen and route-level code splitting for faster cold start.

### Terminal

- Embedded PTY terminal (xterm.js) with tabs and split panes.
- Full-view (maximize) mode for the active terminal, plus drag-to-terminal for files.

### Git

- Status, commit log, diffs, branch listing, repo init, and multi-repo scan (libgit2).
  The Changes view is read-only today — staging/commit is on the roadmap below.
- Git worktrees — create, remove, and prune without leaving LiteDuck.

### Settings & security

- Modular settings sections with a reactive `useConfig()` hook and debounced auto-save.
- OS keychain secret storage, biometric lock with idle auto-lock, and locally generated
  device identity.
- JSON config files as the source of truth (`~/.LiteDuck` + workspace `.LiteDuck`), with
  SQLite kept only as a rebuildable runtime index.

### Plugins & extensibility

- Manifest-based plugin system — the sanctioned extension point. The app ships lean (no
  bundled plugins); install Jira, BWOC, and third-party plugins on demand from the GitHub
  registry. Commands render via built-in declarative views (`table`/`keyvalue`/…).
- Plugin UI host (ADR-002, Phase 1) — a plugin may ship its own executable UI, served from
  the isolated `plugin://` custom scheme (separate origin, own CSP, no host/Tauri access) and
  driven by a `postMessage` command bridge. Charter-safe: no AI surface, deny-list intact.
- VS Code-style workspace shell with context-aware right-click menus and an OS-junk
  (`.DS_Store` etc.) file filter.

### Platform & distribution

- Tauri v2 desktop build for macOS, distributed as a **build-from-source Homebrew
  formula** (`brew install bemindlabs/liteduck/liteduck` compiles locally). Updates
  via `brew upgrade`; CalVer versioning. No prebuilt DMG, no Mac App Store, and no
  in-app updater. Windows and Linux packaging is planned.
- Quality gate (TypeScript, ESLint, Prettier, Vitest, `cargo check`/`clippy`/`fmt`/`test`)
  in CI.

---

> **Heritage.** LiteDuck began as "LoopDuck", an AI-first workspace with autonomous agents,
> an AgentsCouncil/Scrum pipeline, chat, MCP, Docker, SSH, and GitHub integrations. All of
> that was removed to refocus on a fast, local editor. See [ADR-001](docs/adr-001-single-direction.md)
> and the [CHANGELOG](CHANGELOG.md).

*The duck glides. No fuss, no clutter — just your files, a terminal, and Git.*
