# File Manager + Code Editor — "ได้มาตรฐาน" Implementation Plan

**Date:** 2026-06-02
**Scope:** Bring LiteDuck's file manager and code editor up to mainstream-editor
standard, including the right-click (context menu) surface.
**Decisions locked with operator (พี่ต้นกล้า):**

1. **Code editor → CodeMirror 6** (replace the textarea + custom-regex highlighter).
   Accepts a controlled relaxation of the "no external deps" line in CLAUDE.md —
   CodeMirror is the standard, weighs ~150–300 KB gz with a few languages + lazy
   loading the rest.
2. **Scope = both** editor **and** file manager.
3. **Context menus** ("right click options") — the necessary/important ones — are
   in scope per operator follow-up.
4. **Plan-first** — this note is the reviewable proposal. No code until approved.

---

## Current State (verified by exploration)

### Code editor
- `src/components/FilePreview.tsx` (556 lines) does everything: load, markdown
  preview/edit/split, code editor (transparent `<textarea>` over a colored
  `<pre>` + manual scroll-synced line-number gutter), read-only `<table>` code
  view, save/revert/copy, status bar.
- `src/components/file-preview/syntax-highlight.tsx` (147 lines) — regex
  tokenizer, ~79 hardcoded keywords (js/ts/rust/go), no real language grammar.
- `src/components/file-preview/MdToolbar.tsx` — 12 markdown buttons that mutate
  the **textarea** selection via `textareaRef` + `setEditContent`.
- **Missing:** find/replace, bracket matching, real undo/redo stack, multi-cursor,
  smart auto-indent, language-aware highlighting, code folding.

### File manager
- Backend `src-tauri/src/files.rs` (564 lines) — 8 commands: list / read / write /
  rename / create_dir / delete / get_metadata / open_in_vscode. Solid path
  validation + OS-clutter filter. **No copy, no move, no watch, no reveal, no
  recursive search.**
- Frontend `src/lib/files.ts` (8 wrappers), `FileTree.tsx` (463), `FilePreview`,
  `workspace/FilesTreePanel.tsx` (250), `pages/FilesPage.tsx` (420).
- **Missing:** copy/cut/paste, multi-select, drag-to-move, filename search/filter,
  external-change watcher (auto-refresh), keyboard navigation, error toasts,
  sortable columns, reveal-in-Finder.

### Context menus
- Shared primitive `src/components/ui/ContextMenu.tsx` — declarative items,
  supports `separatorBefore`, `destructive`, `disabled`, `keepOpen`, `show`.
  **No icons, no submenus** (could add icon support cheaply).
- FileTree menu today: Open Terminal Here · Rename · Copy Path · Delete (2-step).
- EditorArea menu today: Copy · Select All · Close Tab. Intentionally omits
  Cut/Paste because the native textarea handled them.
- **Gotcha:** the global native-context-menu suppression + EditorArea's
  `handleContextMenu` both special-case `TEXTAREA`/`INPUT`. CodeMirror renders a
  contenteditable `.cm-content` div, **not** a textarea — both checks must be
  updated or the editor loses its right-click menu.

---

## Plan

Six phases. Each phase ends green on the quality gate for the files it touches.

### Phase 0 — Dependencies & scaffolding
- Add CodeMirror 6 packages:
  - core: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`,
    `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`
  - languages: `@codemirror/lang-javascript`, `lang-rust`, `lang-python`,
    `lang-json`, `lang-markdown`, `lang-html`, `lang-css`, `lang-yaml`;
    `@codemirror/legacy-modes` (go, toml, shell, etc.);
    `@codemirror/language-data` for lazy match-by-filename.
- New `src/lib/editor/` module: language resolver (ext → `LanguageDescription`),
  a CodeMirror theme + `HighlightStyle` bound to the existing `--color-*` design
  tokens (no new palette; visual parity with current dark theme).

### Phase 1 — Code editor → CodeMirror 6
- New reusable `src/components/editor/CodeEditor.tsx` wrapping an `EditorView`:
  - extensions: line numbers, active-line highlight, `history()` (undo/redo),
    `bracketMatching`, `closeBrackets`, `indentOnInput`, `foldGutter`,
    `highlightSelectionMatches`, `search` (`openSearchPanel` = find/replace),
    light `autocompletion`, `keymap` (default + history + search + `indentWithTab`),
    plus a custom `Cmd/Ctrl+S` binding → `onSave`.
  - props: `value`, `onChange`, `extension`/`filename` (drives language),
    `readOnly`, `onSave`. Lazy-load the matched language.
- Refactor `FilePreview.tsx`:
  - Code branch: replace textarea+`<pre>`+gutter with `<CodeEditor>`.
  - Markdown edit/split: use `<CodeEditor filename="x.md">`; adapt **MdToolbar**
    to insert/wrap via a CodeMirror imperative handle (dispatch transactions)
    instead of textarea selection.
  - Delete the read-only `<table>` view (CodeMirror `readOnly` replaces it) and
    retire `syntax-highlight.tsx`.
  - Keep dirty-state / save / revert / copy / status-bar logic; `onChange` feeds
    `editContent`. Keep 1 MiB truncation → read-only.
- Tests: rewrite `FilePreview.test.tsx`; add `CodeEditor.test.tsx` (mount, type →
  onChange, Cmd+S → onSave, find panel opens).

### Phase 2 — File manager backend (Rust)
- New `#[tauri::command]`s in `files.rs`, all behind existing `validate_path`:
  - `files_copy(src, dest, workspace)` — recursive copy, no silent overwrite.
  - `files_move(src, dest, workspace)` — move across dirs (rename + cross-device
    fallback), no silent overwrite.
  - `files_reveal_in_os(path)` — macOS `open -R` (reveal in Finder).
  - `files_find(root, query, limit, workspace)` — bounded recursive filename
    search (respects clutter filter + hidden flag; capped result count).
  - Watcher: `files_watch(path)` / `files_unwatch(path)` using the `notify` crate,
    debounced, emitting a `files://changed` Tauri event. (Heaviest item; if it
    risks the timeline it can be deferred to a follow-up — flagged, not silent.)
- Rust unit tests for copy/move/find (tempdir-based).

### Phase 3 — File manager frontend behavior
- `src/lib/files.ts`: add `filesCopy`, `filesMove`, `filesRevealInOs`,
  `filesFind`, watch subscribe/unsubscribe helpers.
- New `useFileClipboard` (small context): `{ paths, op: 'copy' | 'cut' }`; paste
  resolves into the target dir via `filesCopy` / `filesMove`, then refresh.
- `FileTree` / `FilesTreePanel`:
  - **Multi-select:** Cmd/Ctrl-click toggle, Shift-click range over the visible
    flattened list; selection lifted to the panel.
  - **Keyboard nav:** roving-tabindex list — ↑/↓ move, ←/→ collapse/expand,
    Enter open, F2 rename, Delete delete, Cmd+C/X/V clipboard.
  - **Filter box:** filter loaded nodes by name; deep matches via `files_find`.
  - **Drag-to-move:** HTML5 DnD drop onto a folder → `filesMove`; must not
    collide with the existing drag-to-terminal `LITEDUCK_PATH_MIME` path.
  - **Auto-refresh:** subscribe to `files://changed` for the open root (replaces
    manual Cmd+R as the default; keep the button as fallback).
  - **Error toasts:** route rename/delete/copy/move failures through the existing
    `NotificationCenter` instead of the current silent `logger.error`.
- `FilesPage`: optional sort toggle (name / size / date, asc/desc), client-side.

### Phase 4 — Context menus (right-click)
- (Optional, cheap) add `icon?` to `ContextMenuItem` for visual parity with VS Code.
- **File / folder menu** (FileTree): Open · Open in VS Code · Open Terminal Here ·
  — · New File · New Folder (when on a folder) · — · Cut · Copy · Paste
  (enabled when clipboard non-empty & target is a dir) · Duplicate · — · Rename ·
  Delete · — · Copy Path · Copy Relative Path · Reveal in Finder.
- **Empty-space menu** (tree background): New File · New Folder · Paste · Refresh.
- **Editor menu** (CodeMirror): Cut · Copy · Paste · — · Find (open search panel) ·
  Select All · — · Close Tab. Fix the `TEXTAREA` special-case in the global
  suppression hook + `EditorArea.handleContextMenu` to recognize `.cm-content`.

### Phase 5 — Quality gate + release hygiene
- Run `npm run quality-gate` (tsc, prettier check, eslint, vitest+coverage, then
  `cargo check/fmt/clippy -D warnings/test`).
- Version bump in the 3 files (`package.json`, `tauri.conf.json`, `Cargo.toml`).
- `CHANGELOG.md` entry; update README/CLAUDE.md feature notes (incl. the
  "no external deps" → "CodeMirror" nuance). Finalize this note.

---

## Resolved decisions (operator said "continue")

1. **Watcher (`notify`)** — included. Backend commands shipped; UI auto-refresh wiring
   deferred (see Outcome) to avoid the tree-collapse regression.
2. **Execution shape** — Rust backend ran as a parallel sub-agent (independent files);
   editor + file-manager frontend done in sequence (overlapping files).
3. **Markdown editor** — unified on CodeMirror.

## Outcome (2026-06-02)

**Done & green** (frontend gate fully passes: tsc, prettier, eslint, 793 vitest tests
incl. new CodeEditor / fileOps / fileClipboard suites; `cargo check`/`fmt`/`clippy`
clean):

- Phase 0–1 — CodeMirror 6 editor: `src/lib/editor/{language,theme}.ts`,
  `src/components/editor/CodeEditor.tsx` (+ test), `FilePreview.tsx` rewired,
  `MdToolbar.tsx` driven by an imperative handle, `syntax-highlight.tsx` deleted.
- Phase 2 — Rust: `files_copy/move/reveal_in_os/find/watch/unwatch` + `FileWatchManager`
  managed state + `notify` dep; wrappers in `files.ts`; Rust + vitest tests.
- Phase 3–4 — `fileClipboard.ts`, `fileOps.ts`, full FileTree context menu (cut/copy/
  paste/duplicate/new/rename/delete/copy-path/copy-rel-path/reveal/vscode/terminal),
  empty-space menu, drag-to-move, error toasts via `notificationStore`; `EditorArea`
  right-click now defers to CodeMirror's native editing menu.
- Phase 5 — version bump 2026.5.29 → 2026.6.2 (package.json, tauri.conf.json,
  Cargo.toml), CHANGELOG, README, CLAUDE.md.

**Pre-existing, NOT caused by this work:** under a full parallel `cargo test`, two tests
(`plugins::tests::run_command_uses_workspace_as_cwd_when_valid`,
`windows::tests::registry_round_trips_upsert_list_remove`) fail due to a process-global
`LITEDUCK_HOME` env + `set_current_dir` race and a poisoned-Mutex cascade. They pass
serially and fail identically on the pre-change `HEAD` (verified by stashing). Test
isolation for those two is its own follow-up.

**Deferred follow-ups (logged in CHANGELOG):**
- Live file-watch auto-refresh from the UI (needs an in-place tree refresh, not a
  remount, or expanded folders collapse on every change — including the user's own saves).
- Multi-select + full keyboard tree navigation (need a flattened visible-node model).
- Pre-existing parallel-test isolation fix in `plugins.rs` / `windows.rs`.

## Risk notes
- Bundle size grows; mitigated by lazy language loading + a trimmed language set.
- Global context-menu suppression assumes textarea — must update for CodeMirror
  or the editor right-click breaks (called out in Phase 4).
- `files.test.ts` mocks all 8 invokes; new commands need matching mocks.
- This is the LiteDuck product repo (`bemindlabs/liteduck`), separate from the
  BWOC framework — work is done directly here, not via the bwoc agent fleet.
