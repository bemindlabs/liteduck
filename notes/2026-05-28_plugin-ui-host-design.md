# Plugin UI extension host — design spec (2026-05-28)

Companion to [ADR-002](../docs/adr-002-plugin-ui-extension-host.md). ADR-002 records the
*decision* (allow plugins to ship executable UI, isolated in a sandboxed iframe). This note
specifies the *mechanism*: package layout, the host↔plugin bridge, the loading lifecycle,
capability gating, CSP, phasing, and migration.

> Status: design for review. No code lands from this note until the operator approves the
> approach and ADR-002 flips to Accepted.

## Goals / non-goals

**Goals**
- A plugin can ship an arbitrary, interactive UI that versions with the plugin in the registry.
- The UI cannot compromise the host: no access to the host DOM, storage, or the Tauri `invoke`
  bridge; it can only do what the plugin's declared shell commands already could.
- Declarative plugins keep working unchanged; the JS host is strictly opt-in.

**Non-goals**
- No AI/agent/chat (deny-list unchanged). No widening of shell-command privileges.
- Not a general npm-style runtime — a plugin ships ONE self-contained UI bundle, no dynamic
  remote fetches from inside the iframe (CSP-blocked).

## Package layout (in `liteduck-plugins/plugins/<id>/`)

```
plugins/jira/
  plugin.json     # + optional "ui" entry (below)
  jira.sh         # unchanged — still the data/command layer
  ui.js           # NEW: the plugin's UI bundle (self-contained ESM, no bare imports)
  SPEC.md
```

`plugin.json` gains an optional plugin-level `ui` block:

```json
{
  "id": "jira",
  "ui": {
    "entry": "ui.js",          // relative to the plugin dir
    "height": "full",          // "full" | a px hint for panel surfaces
    "fallback": "declarative"  // if the bundle fails to load → declarative views
  },
  "commands": [ ... ]          // unchanged; the UI invokes these via the bridge
}
```

- **Presence of `ui`** → the plugin renders through the JS host.
- **Absence** → declarative views, exactly as today (backward compatible).
- The bundle is a **single ESM file** with no external/bare imports (the sandbox has no
  network and no module resolver). Authors bundle their deps (e.g. esbuild) before publishing.

## Isolation model

```
┌─ host window (script-src 'self', has Tauri invoke) ──────────────┐
│  PluginsPanel / PluginHostFrame                                  │
│   └─ <iframe sandbox="allow-scripts">  (opaque origin)           │
│        srcdoc = bootstrap HTML + plugin ui.js (via blob:)        │
│        • no allow-same-origin → no host DOM/storage/cookies      │
│        • no Tauri invoke reachable                               │
│        • talks to host ONLY via postMessage bridge ▼             │
└──────────────────────────────────────────────────────────────────┘
        ▲ postMessage (versioned, allow-listed) ▼
   host validates every request against the plugin's manifest
```

- `sandbox="allow-scripts"` **without** `allow-same-origin` gives the iframe an opaque origin:
  scripts run, but `window.parent` access, same-origin storage, and the Tauri IPC are all
  unreachable. This is the crux of the safety argument.
- The bootstrap HTML (host-authored, trusted) sets up the bridge client and then evaluates the
  plugin's `ui.js`. Plugin JS is delivered as a `blob:` URL referenced from `srcdoc`, so the
  host page's own CSP never has to allow plugin script.

## The bridge (host ↔ plugin iframe)

All messages are `{ v: 1, type, id?, payload }` over `postMessage`. `v` is the bridge version.
The host **ignores** any message type not in the allow-list, and validates every `run-command`
against the plugin's declared commands.

**host → plugin**
| type | payload | when |
|---|---|---|
| `init` | `{ pluginId, theme, workspace, capabilities, commands }` | once, after iframe `ready` |
| `command-result` | `{ requestId, ok, stdout, stderr, exitCode }` | reply to a `run-command` |
| `theme` | `{ theme }` | host theme changed |

**plugin → host**
| type | payload | gate |
|---|---|---|
| `ready` | `{}` | — (handshake) |
| `run-command` | `{ requestId, commandId, params }` | `commandId` MUST be one the plugin declared; `params` → `LITEDUCK_PARAM_*` (same path as today) |
| `resize` | `{ height }` | panel-surface sizing only |
| `open-external` | `{ url }` | gated: only if plugin declares `network` + host confirms scheme `https` |
| `log` | `{ level, msg }` | routed to the plugin's log namespace |

Key invariant: **`run-command` reuses the existing `plugin_run_command` path** — same workspace
CWD, same `LITEDUCK_PARAM_*` env, same declared-command check. The UI host adds **zero** new
execution capability; it is a new *renderer*, not a new *privilege*.

## Capability gating

- The UI may only call commands the plugin declared (`commands[].id`). A forged `commandId` is
  rejected host-side.
- `open-external` requires the plugin's `network: true` + an `https:` URL + (Phase 2) a
  per-plugin user grant.
- No filesystem, no process spawn, no clipboard beyond what a declared command yields. The
  declared `paths` / `network` from the manifest remain the ceiling.

## CSP

- Host window: **unchanged** (`script-src 'self'`).
- The iframe is sandboxed with an opaque origin; its content is host-authored bootstrap +
  blob-delivered plugin code. We add a frame allowance for the sandboxed child only. The host's
  `connect-src` is **not** opened to plugin code (the iframe has no network by default).

## Phasing

1. **Phase 1 — minimal host.** `PluginHostFrame` component: sandboxed iframe, bootstrap,
   `ready`/`init` handshake, `run-command` → `command-result`. Convert **bwoc or jira** to a
   tiny `ui.js` as the proving case (keep declarative as `fallback`). Bridge `v: 1` =
   `init` + `run-command` + `resize` + `log` only.
2. **Phase 2 — capabilities + consent.** Install-time consent UI ("ships executable UI" +
   declared caps); `open-external` gating with a per-plugin grant; theme propagation.
3. **Phase 3 — author ergonomics.** A typed UI SDK (`@liteduck/plugin-ui` types for the bridge
   client), a dev hot-reload path, and a documented bundling recipe. Bridge versioning policy.

## Migration / compatibility

- Existing declarative plugins: **no change**, no `ui` entry → declarative renderer.
- A plugin can ship BOTH a declarative `view` (for hosts that don't yet support the UI host or
  if the bundle fails) and a `ui` bundle; `fallback: "declarative"` selects the safe path on
  load error.
- Bridge is versioned (`v`); the host supports the current major and refuses unknown majors
  with a clear message rather than running mismatched code.

## Security review (summary)

| Risk | Mitigation |
|---|---|
| Plugin JS reads host data / calls Tauri | Opaque-origin sandbox; no `allow-same-origin`; no invoke in the frame |
| Plugin runs undeclared commands | Host validates `commandId` against the manifest |
| Plugin exfiltrates over network | Iframe has no network; `connect-src` not opened; `open-external` gated |
| Plugin escalates via params | Params pass as `LITEDUCK_PARAM_*` env, never string-interpolated (existing rule) |
| Supply-chain (malicious bundle) | Install consent; registry `verified` flag; future signing (Phase 3+) |
| Charter drift (AI surface returns) | `chat`/`agent`/`llm` `kind` deny-list unchanged |

## Open questions for the operator

1. **Proving plugin** — convert jira or bwoc first to a JS UI in Phase 1? (jira has the richer
   payload; bwoc is simpler.)
2. **Bundle authoring** — do we ship a starter template + bundling recipe in
   `liteduck-plugins`, or document esbuild and leave it to authors?
3. **Surfaces** — JS UI for both the `panel` and `page` surfaces in Phase 1, or `page` only?
4. **Signing** — is registry `verified` + install consent enough for v1, or do we want bundle
   signing before any JS-UI plugin can be installed?
