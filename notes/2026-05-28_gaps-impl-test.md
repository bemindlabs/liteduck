# LiteDuck gap audit — implementation completeness + test coverage — 2026-05-28

> Read-only audit after the large session (plugin system, workspace shell, terminal
> redesign, tmux/updater removal, Homebrew distribution, context menus, drag-to-terminal,
> OS-junk filter, Git full-width). Scope: `src/` + `src-tauri/src/`. No edits made.

## Summary

- **Biggest gap: the plugin system is half-built.** The Rust loader + 6 IPC commands +
  PluginsPanel UI are solid, but plugins can ONLY be run by clicking a button in
  PluginsPanel — the design note's Phase 2/3 contribution surfaces (command-palette,
  keybindings, menus, status-bar, preview renderers) are **all unwired**. `kind`/`args`
  fields exist in the schema but nothing consumes them.
- **No seed-on-first-launch** for bundled `jira`/`bwoc` plugins — they ship in
  `resources/` and are bundled by `tauri.conf.json`, but nothing copies them into
  `~/.liteduck/plugins/`, so they are never discovered. (Confirms the design note's flag.)
- **8 of 8 workspace-shell components have zero tests**; all 6 new plugin frontend
  modules untested; the registry HTTP install success path has no Rust test.
- **Rust error-handling is in good shape** — `git.rs`/`plugins.rs`/`terminal.rs` have
  ZERO non-test `unwrap()`/`expect()`. The ROADMAP P0 "panic hardening" is mostly about
  test-block unwraps (~261 in `home.rs`) and `lib.rs:288/340` runtime `.expect()`.
- **Counts:** P0 ×4, P1 ×8, P2 ×6 implementation; ~14 new source files with no tests.

---

## Implementation gaps

### P0

- **Bundled plugins never seed → Jira/BWOC undiscoverable.**
  `src-tauri/tauri.conf.json:32` bundles `resources/plugins/jira/**` + `bwoc/**`, but no
  code copies them to `~/.liteduck/plugins/` on first launch. `list_plugins_inner`
  (`src-tauri/src/plugins.rs:233`) only scans `~/.liteduck/plugins/`; `ensure_home`
  (`src-tauri/src/home.rs:436`) seeds dirs/profile but NOT plugins. Net effect: a fresh
  install shows "No plugins installed" and the first-party plugins are inert dead weight
  in the bundle. Either seed on first launch or surface them as install-able registry
  entries. (`grep "resources/plugins" src src-tauri/src` finds only comments + the
  conf line — no copy logic.)
- **Plugin contributions are declared but not consumed.** `PluginCommand.args`
  (`src-tauri/src/plugins.rs:59`) and `PluginManifest.kind` are parsed and round-tripped
  to the UI, but `src/lib/commands.ts` has **no** reference to plugins (`grep -i plugin
  src/lib/commands.ts` = empty), `useKeyboardShortcuts` registers no plugin keybindings,
  and `app_menu.rs` builds no plugin menu items. The design note's Phase 2 ("merge
  plugin-contributed commands into the palette") and Phase 3 (status-bar, preview, menu
  slots) are unbuilt. Only the manual `handleRun` button path in `PluginsPanel.tsx:173`
  can execute a command. This is the core value proposition of the hybrid model and it's
  missing.
- **`run_command` ignores declared `args` — no param UI.** `PluginsPanel.tsx:177` calls
  `pluginRunCommand(plugin.id, command.id)` with **no params ever**, even when
  `command.args` lists required keys (`plugins.rs:564` reads `params` and exports
  `LITEDUCK_PARAM_*`). A command that needs input (e.g. `jira.view` an issue key) has no
  way to receive it from the UI — it will run with empty env vars. The Jira `jira.view`
  command in `resources/plugins/jira/plugin.json` is therefore non-functional from the
  panel.
- **Git Changes view is read-only — no stage/commit/discard.** `git.rs` exposes no
  `git_add`/`git_reset`/`git_commit`/`git_discard_file` (verified: only status/log/diff/
  branch/worktree/init/scan at `git.rs:415-742`). `GitStatus` even carries
  `staged_modified`/`staged_added`/`staged_deleted` (`git.rs:18-20`) that the UI can
  display but never produce. Tracked on ROADMAP ("Writable Git workflow") — see Deferred.

### P1

- **Permissions settings section is decorative.** `src/pages/settings/sections/
  PermissionsSection.tsx:17` carries `// TODO: backend wiring pending`; all seven rows are
  hardcoded "granted" with no runtime check. "Live status reporting is not yet wired"
  (line 71). A user who denies FS/keychain in macOS still sees "Granted".
- **Registry `install_from_registry` re-fetches `registry.json` then re-lists the dir.**
  `plugins.rs:473` calls `registry_fetch_inner` purely to resolve `source`, then
  `list_contents` re-hits the Contents API (`:489`) — two GitHub round-trips minimum per
  install against the 60 req/hr unauthenticated limit. Cheap to fold but currently
  doubles rate-limit pressure.
- **PluginsPanel "Available" empty/error states overlap.** On a failed registry fetch
  `AvailableView` shows the error banner AND, because `entries.length === 0 && !error` is
  false, falls through to the entries `<ul>` (empty) — net OK, but a *partial* fetch that
  throws after `setRegistryLoaded(true)` would strand stale entries with no error. Minor
  but the loaded/error/loading tri-state isn't airtight (`PluginsPanel.tsx:98-110, 446-456`).
- **`relativeTime` / `useGitGraph` recompute every render** — see git-page-review note
  P0s (`HistoryTab.tsx:96`, `git.ts:139`); large-repo stutter, no virtualization anywhere
  in Git.
- **`gitDiffWorking` returns whole-repo diff, filtered client-side**
  (`ChangesTab.tsx:41`) — O(repo) IPC payload to render one file. (git-page-review P1.)
- **`gitLog` re-fetches from offset 0 on every "Load more"** (`HistoryTab.tsx:121`).
- **Settings error banner is invisible** — `SettingsPage.tsx:132` uses
  `text-[var(--color-destructive)]` on `bg-[var(--color-destructive)]` (red-on-red); same
  bug in `IdentitySection.tsx:153` confirm button. (settings-audit note.)
- **Stale "broadcast to connected peers" copy** in `IdentitySection.tsx:138` — LiteDuck
  has no peer layer; LoopDuck residue. (settings-audit note.)

### P2

- Shortcuts section: no conflict detection (`ShortcutsSection.tsx:100`); free-text
  `font_size`/`terminal_scrollback` accept `"abc"` (`GeneralSection.tsx:22-49`).
- Dead `onDeleteSecret` prop threaded through General/Workspace sections (no secret
  fields exist; `SECRET_KEYS` empty at `SettingsPage.tsx:57`).
- Duplicate StatusBanner render (`SettingsPage.tsx:388` + `:414`).
- `repoError` literal duplicated (`GitPage.tsx:78,125`); reset = `window.location.reload()`
  (`SettingsPage.tsx:426`).
- WorktreesTab `sm:/lg:` breakpoints never fire in the ≤600px side panel
  (`WorktreesTab.tsx:470`).
- `cellText` JSON-encodes nested objects in the run-result table
  (`PluginsPanel.tsx:51`) — fine, but deeply-nested Jira fields render as `[object]`-ish
  blobs with no formatting.

---

## Test-coverage gaps

45 Vitest files exist, but the NEW session code is largely uncovered.

**New frontend source files with ZERO tests:**

- `src/lib/plugins.ts` — IPC wrappers (param-shaping: `params ?? null`,
  `registryUrl ?? null`). No test asserts the invoke argument shapes.
- `src/components/plugins/PluginsPanel.tsx` — the entire plugin UI: install-from-folder,
  install-from-registry, uninstall, run, tab switching, error surfacing, Jira-rows
  parsing (`handleRun:188-198`). No test.
- `src/components/workspace/*` — **all 8** (`WorkspaceShell`, `ActivityRail`, `SidePanel`,
  `EditorArea`, `EditorTabs`, `FilesTreePanel`, `StatusBar`, `TerminalDock`). The primary
  app surface has no component tests at all.
- `src/components/terminal/TerminalPane.tsx` — no test (terminal redesign output).
- `src/components/FilePreview.tsx` (554 LoC, now an editor with save/revert/Cmd+S,
  markdown split/preview modes) — no test for the save path or dirty-state.
- `src/components/file-preview/MdToolbar.tsx`, `syntax-highlight.tsx` — no tests.
- `src/components/FileTree.tsx` — no test (context-menu + drag-to-terminal source).

**Covered (good):** `ContextMenu.test.tsx`, `useSuppressNativeContextMenu.test.ts`,
`shellQuote.test.ts`, `splitTerminalUtils.test.ts`, `useGitGraph.test.ts` all exist.

**Rust `plugins.rs` test gaps:** validation + deny-list + install/uninstall roundtrip +
`run_command` env-passing + registry-doc parsing + host-allow-list are all tested (10
tests). **NOT tested:** the registry HTTP *success* path — `registry_fetch_inner` (live
fetch + parse), `list_contents`, `fetch_file_bytes`, `download_contents_into`, and
`install_from_registry_inner`'s download+stage+atomic-move happy path. The only
`install_from_registry_inner` test is the no-network bad-id rejection
(`plugins.rs:848`). No HTTP mock (e.g. `mockito`/`wiremock`) is wired, so the entire
download/stage/install flow — including the staging-cleanup-on-failure logic at
`plugins.rs:521-539` — is unverified. **This is the riskiest untested code** (it writes
to disk from network input).

**Should-cover priorities:** (1) registry install happy + partial-failure-cleanup path
(Rust, with HTTP mock); (2) `PluginsPanel` install/uninstall/run/error rendering (RTL +
mocked invoke); (3) `WorkspaceShell` panel-toggle + route sync; (4) `FilePreview` save +
dirty-state + Cmd+S.

---

## Error-handling / robustness gaps

- **Rust crash-path hygiene is GOOD.** Non-test `unwrap()`/`expect()` counts:
  `git.rs` 0, `plugins.rs` 0, `terminal.rs` 0, `pty.rs` 0, `workspace.rs` 0 (all 31 are in
  the test module). `home.rs`'s 261 are likewise all in `#[cfg(test)]`. The only genuine
  runtime panics are `lib.rs:288` and `lib.rs:340`
  (`.expect("error while running tauri application")`) — acceptable (top-level app boot;
  nothing to recover to). The ROADMAP P0 "panic hardening" is therefore lower-risk than it
  reads — mostly a clippy-lint/labeling exercise, not active crash bugs.
- **Plugin `run_command` has no timeout / output cap.** `plugins.rs:598` uses
  `command.output()` which blocks until the child exits and buffers unbounded
  stdout/stderr into memory. A plugin that hangs (e.g. waits on stdin) or emits gigabytes
  freezes the IPC call / balloons memory. The `Duration::from_secs(15)` timeout is only on
  the HTTP client, not on subprocess execution. P1 robustness gap.
- **PluginsPanel error surfacing is partial.** Install/uninstall/run errors land in
  `error`/`registryError` and DO render (`:261`, `:441`) — good. But the per-command run
  error only shows inside the matching plugin's card (`run?.pluginId === plugin.id`,
  `:361`); if the user runs cmd A then cmd B on a different plugin, A's error silently
  disappears (single `run` state). Minor.
- **No unhandled-rejection risk found** in the new components — every `await invoke`/
  `pluginX` call in PluginsPanel is inside try/catch with a `setError`. `useTerminal`
  IPC calls all `.catch(logger.error)` (`useTerminal.ts:218-289`).

---

## Wiring / dead-code gaps

- **All 6 plugin IPC commands are registered AND invoked** — `plugin_list`,
  `plugin_install`, `plugin_uninstall`, `plugin_run_command`, `plugin_registry_fetch`,
  `plugin_install_from_registry` (`lib.rs:280-285` ↔ `src/lib/plugins.ts`). No orphans.
- **All terminal/git/files/home/settings IPC commands match** between
  `generate_handler!` (`lib.rs:201-287`) and frontend invokes. (Verified the full invoke
  list against the handler — no orphan invoke, no unused command, except see below.)
- **Stale removals are clean.** No `tmux`, `check_for_update`, `bwoc_detect`, `bwoc_list`,
  auto-updater, or DMG/MAS references remain in `src/` or `src-tauri/src/`. NOTE: the
  earlier `settings-page-audit.md:102-103` lists `bwoc_detect`/`bwoc_list`/
  `check_for_update` as registered — that audit is now **stale**; those commands were
  removed when integrations moved to plugins. `IntegrationsSection.tsx` correctly points
  at the plugin system now (no invokes).
- **`PluginManifest.kind` is plumbed end-to-end but only used for a display badge**
  (`PluginsPanel.tsx:301`) — never drives behavior (no per-kind preview/formatter hook).
  Expected given contribution surfaces are unbuilt, but worth noting it's a
  display-only field today.

---

## Deferred-but-tracked (confirmed real, do not re-plan)

- **Read-only Git Changes view (no stage/commit IPC)** — CONFIRMED. ROADMAP "Writable Git
  workflow" P1 lists the exact missing commands (`git_add`/`git_reset`/`git_commit`/
  `git_discard_file`). git-page-review note ChangesTab P1 agrees.
- **Plugin sandbox is user-trust v1 (no OS sandbox)** — CONFIRMED. `plugins.rs:9,22-26`
  documents it; subprocesses inherit full user privileges; manifests only *declare*
  `network`/`paths` (surfaced in UI, not enforced).
- **Jira plugin read-only (no write verbs)** — CONFIRMED. `resources/plugins/jira/
  plugin.json` declares only `jira.list` + `jira.view`; no create/update/transition/
  comment commands (`grep create|update|transition` = empty).
- **No plugin signing / checksums** — CONFIRMED. `install_from_registry_inner` validates
  the manifest schema + host allow-list + id match, but never verifies a signature or
  content hash; `verified` is a registry-asserted display flag only (`RegistryEntry.
  verified`, badge at `PluginsPanel.tsx:500`), not a cryptographic check.
- **Read-only FilePreview / "no real editor" — SUPERSEDED, NOT a gap.** FilePreview is now
  a working editor: textarea + dirty-state (`hasChanges`), Save via `filesWriteText`
  (`FilePreview.tsx:120-138`), Revert, Cmd+S (`:158`), and markdown edit/split/preview
  modes. The plugin-system design note's "read-only FilePreview" deferral predates this —
  flag it as resolved when updating tracking. (It still lacks tests — see above.)
