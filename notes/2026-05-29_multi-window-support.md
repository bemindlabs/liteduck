# Multi-Window Support — Architecture & Implementation

Date: 2026-05-29
Owner: operator (Tonkla) + Claude

## Goal

Let LiteDuck open multiple top-level windows, each able to point at its own
workspace (or share one), with **per-window state isolation** so closing or
switching windows never leaks state between them. Modelled after VS Code's
multi-window UX.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Both** window-open modes: "New Window" (clones current workspace) **and** "New Window with Workspace…" (lands at workspace picker / landing) | Matches VSCode `Cmd+Shift+N` + `File > Open Recent`. Covers "give me another view of the same project" and "open a different project" without forcing one mental model. |
| 2 | **Per-window PTY**: each window owns its own terminal tabs; sessions never cross window boundaries | Today `PtyManager` is process-global; `pty-output` events are broadcast. Without scoping, Window B's xterm would receive Window A's bytes — a real correctness issue (cursor flickering, wrong session_id binding races), not just cosmetic. |
| 3 | **Per-window workspace** via URL query param (`?workspace=<encoded>&window=<label>`) | The frontend already gates routes on `workspace` from `WorkspaceContext`. Driving it from the URL keeps the per-window decision purely client-side at load time. Persistence is via a new `~/.liteduck/windows.json` keyed by window label. |
| 4 | **Menu actions target the focused window** (`emit_to(focused_label, …)`) | Current `app.emit("menu-action", …)` broadcasts to every webview — Cmd+T pressed in Window B would open a tab in Window A too. |
| 5 | **Per-window `TauriEventSink`** registered when the window is created | The setup hook only wires a sink for `"main"`. New windows would get no events at all unless we register on creation. |
| 6 | **Full** scope (state isolation + window-state persistence + restore on launch) | Operator chose Full. Implementation lands in phases (see below). |

## Architectural model

```
~/.liteduck/
  windows.json     ← list of windows + per-window state
    [
      {
        "label": "main",
        "workspace": "/Users/.../foo",
        "geometry": { "x": 100, "y": 100, "w": 1280, "h": 800 },
        "lastFocused": "2026-05-29T10:30:00Z"
      },
      { "label": "window-7a3f", "workspace": "/Users/.../bar", ... }
    ]
```

* **`label`** — stable identifier (`main` for first; `window-<8-hex>` for new ones).
  Used as Tauri webview label, PTY-session window tag, and event-target key.
* **`workspace`** — absolute path. The frontend reads from URL on mount and
  writes back through a `window_set_workspace(label, path)` IPC.
* **`geometry`** — saved on close (Phase 2).

### Event flow

| Source | Today | After |
|--------|-------|-------|
| `pty.rs` → `pty-output` | `app.emit("pty-output", …)` (broadcast) | `app.emit_to(window_label, "pty-output", …)` |
| `app_menu.rs` → `menu-action` / `menu-navigate` | `app.emit(...)` (broadcast) | `app.emit_to(focused_label, ...)` |
| `event_sink::TauriEventSink` | Wraps `"main"` window once at startup | One sink per webview, registered when `window_open` creates a new one |

### PTY scoping

`PtySession` gains a `window_label: String` field. `create_session` takes the
window label (derived from the calling `WebviewWindow` in the
`#[tauri::command]` signature). `list_sessions` filters by label. Existing
session IDs remain unique across the whole process — only enumeration is
window-scoped — so close/write/resize keep working with bare IDs.

### Frontend

* New `src/lib/window.ts` wraps the IPC commands (`window_open`,
  `window_open_with_picker`, `window_list`, `window_set_workspace`).
* `WorkspaceContext` reads `?workspace=` from `window.location.search` on
  mount. If present, that overrides the legacy global setting for the lifetime
  of this window. `setWorkspace(...)` writes through to the per-window store
  via IPC instead of `saveSetting("workspace_directory", …)`.
* `useMenuEvents` gains two action cases: `"new_window"` (calls `window_open`
  with the current workspace) and `"new_window_pick"` (calls `window_open`
  with no workspace → lands on `/landing`).

## Phasing

### Phase 1 — Core multi-window (this PR)

1. `windows.rs` module + `window_open` / `window_list` / `window_set_workspace` IPC
2. Per-window `TauriEventSink` registration on window creation
3. `PtyManager`: window-label scoping + `emit_to`
4. `app_menu.rs`: `emit_to(focused, …)` + File→New Window + File→New Window with Workspace…
5. Frontend: `lib/window.ts`, URL-driven `WorkspaceContext`, menu wiring
6. `~/.liteduck/windows.json` skeleton (workspace per window; geometry deferred)

### Phase 2 — State restoration (follow-up)

* Save window geometry on `close-requested` event.
* On startup, read `windows.json` and reopen each window with its saved
  workspace + geometry; fall back to a single `main` if the file is missing
  or corrupt.
* `Cmd+~` / Window-menu list to cycle focus between open windows.

## Non-goals

* **Cross-window drag-and-drop of editor tabs** — out of scope; needs editor
  internals not yet built.
* **Single-process vs multi-process model** — Tauri v2 webviews share one
  process; this is fine for LiteDuck's footprint.
* **Per-window theme override** — defer until a user actually asks.

## Risks & open questions

* `WorkspaceGate` reads `workspace` from context to decide redirect-to-wizard.
  Need to confirm it tolerates an initial empty value during URL→state
  hand-off (no flash of wizard before `?workspace=` is read).
* `preloadSecrets()` is called once at app launch in `App.tsx`. With multiple
  windows it'd be called once per window — harmless (Keychain caches), but a
  small redundancy worth noting.
* If two windows open the same workspace and both write `workspace_history`
  via the legacy global setting, the last-writer wins. Migrating workspace
  history to `~/.liteduck/workspaces.json` (which already exists for a
  different purpose) cleans this up but expands scope; not in Phase 1.
