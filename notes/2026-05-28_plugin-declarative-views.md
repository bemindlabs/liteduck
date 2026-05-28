# Plugin declarative views — design spec (2026-05-28)

## Problem

Plugins today contribute **commands only**. A command runs a shell template and its
stdout is shown as raw text/JSON in `PluginsPanel`. Users want richer "pages" — e.g. the
BWOC agent roster as a table, or a Jira issue list — not a wall of JSON.

A full JS/HTML webview page (VS Code-extension style) was originally **rejected**, and this
note described the declarative-only model on that basis.

> **Superseded in part by [ADR-002](../docs/adr-002-plugin-ui-extension-host.md) (2026-05-28).**
> A plugin MAY now ship an executable UI — but isolated on the `plugin://` custom scheme
> (separate origin, own CSP, no host/Tauri access), not in the host window. The declarative
> model below remains the **default + fallback**; the no-AI deny-list is unchanged. The
> "no plugin JS ever executes" statement no longer holds for the isolated host.

We keep the **hybrid (declarative-manifest + shell-command) model** as the default: a plugin
emits **data**; LiteDuck renders it with **trusted built-in components**.

## Design

### Manifest extension

Each command gains an optional `view` field (default `text` = today's behavior):

```json
{
  "id": "bwoc.list",
  "title": "BWOC: List Agents",
  "run": "sh \"$LITEDUCK_PLUGIN_DIR/bwoc.sh\" list",
  "view": "table",
  "default": true
}
```

- **`view`** — enum: `text` | `table` | `list` | `keyvalue` | `markdown`. Absent → `text`.
- **`default`** (optional bool) — one command per plugin may set `default: true`; LiteDuck
  runs + renders it as the plugin's **landing page** when the plugin is opened from the
  activity rail (instead of a bare command list).

#### Plugin-level fields — surface + activity-rail pinning

- **`surface`** (optional, `"panel"` | `"page"`, default `"panel"`):
  - `"panel"` — the plugin appears inside the Plugins panel (the master-detail list →
    detail view); today's default.
  - `"page"` — the plugin opens as a **full page in the editor-area slot**, exactly like
    Git / Settings render full-width. Auto-runs its `default` command as the page body.
    **Open files are preserved** — the editor's open-file tabs are WorkspaceShell state and
    are *not* destroyed when a page surface is shown; switching back to Files restores the
    same tabs (identical to how Git/Settings already behave). It replaces the editor view
    while active, it does not close it.
- **`icon`** (optional string) — a name from LiteDuck's **built-in icon set** (lucide). A
  plugin only *names* a host-provided icon; it never ships an SVG/asset, so there is no
  content surface (charter-safe). Unknown/absent → the generic plugin (Boxes) icon.
- **`pinned`** (optional bool, default `false`) — when true, the plugin gets **its own icon
  in the activity rail** (below the shared Plugins icon). Clicking it opens the plugin's
  page directly (auto-running its `default` command if one is set). **Opt-in** to avoid rail
  clutter — un-pinned plugins stay reachable through the Plugins panel. Pairs naturally with
  `surface: "page"` — a pinned page plugin behaves like a first-class workspace view.

### Output contracts (what the command writes to stdout per `view`)

| `view` | stdout shape |
|---|---|
| `text` | raw text (current behavior) |
| `table` | `{ "columns": ["Name","Status"], "rows": [["agent-prime","active"], …] }` |
| `list` | `{ "items": [{ "title": "...", "subtitle"?: "...", "badge"?: "..." }, …] }` (plain strings also accepted) |
| `keyvalue` | `{ "pairs": [["Version","0.1.0"], …] }` (a flat object is also accepted) |
| `markdown` | a raw Markdown string |

Malformed output for the declared `view` **falls back to `text`** with an inline error
banner — never a crash, never a blank page.

### Rendering

- LiteDuck ships built-in React renderers (`TableView` / `ListView` / `KeyValueView` /
  `MarkdownView` / `TextView`) selected by the command's `view`.
- Rendered **full-width in the editor area** — the workspace shell already renders the
  Plugins surface there (same slot as Git/Settings). The rendered output **is** the
  plugin "page".
- Markdown goes through the existing sanitized `Markdown` component (no raw HTML/script).
  Table/list/keyvalue values render as React text nodes (auto-escaped).

### Security & charter

- **No JS execution from plugins** — only declarative data flows in. Charter-safe; the
  scope-ceiling deny-list (`chat`/`agent`/`llm`) and the user-trust subprocess sandbox are
  unchanged. `view` only affects *how host-trusted code renders host-received data*.
- Markdown sanitized; all data escaped on render.

### Backward compatibility

`view` absent ⇒ `text` ⇒ identical to today. Existing plugins (and the bundled Jira/BWOC)
keep working untouched until their manifests opt in.

## Phasing

1. **Phase 1** — manifest `view` field + JSON-schema update; `text` / `table` / `markdown`
   renderers; malformed-output fallback. Showcase: flip bundled `bwoc.list` and `jira.list`
   to `view: "table"`.
2. **Phase 2** — `list` + `keyvalue` renderers; the `default` landing-page command.
3. **Phase 3 (optional)** — a Refresh affordance (re-run the command), param-driven views
   (run with `LITEDUCK_PARAM_*` from a small form), and persisting a plugin page as an
   editor tab.
4. **Phase 4 — page surface + activity-rail pinning** — manifest `surface: "page"` (opens
   the plugin full-width in the editor-area slot, preserving open file tabs like
   Git/Settings) + `icon` (lucide name) + `pinned` (an activity-rail icon below the Plugins
   icon that opens the page directly). All opt-in; the rail stays uncluttered by default.

## Open questions for the operator

1. **Pagination** — large tables (hundreds of rows): client-side virtualization, or leave
   it to the plugin to page?
2. **Page persistence** — should an opened plugin page become a closeable editor tab (like
   a file), or stay a transient editor-area view?
3. **Refresh** — manual button only, or opt-in auto-refresh interval declared in the
   manifest?
4. **Schema location** — extend the registry's `schema/plugin.schema.json`
   (`bemindlabs/liteduck-plugins`) in lockstep with the in-app loader?

## Files this will touch (impl, not done here)

- `src-tauri/src/plugins.rs` — accept + pass through the `view` / `default` manifest fields.
- `src/lib/plugins.ts` — types for `view` / `default`.
- `src/components/plugins/` — the renderers + the landing-page wiring in `PluginsPanel`.
- `src-tauri/resources/plugins/{bwoc,jira}/plugin.json` + the registry copies — opt into
  `table`.
- `projects/liteduck-plugins/schema/plugin.schema.json` — add `view` enum + `default`.
