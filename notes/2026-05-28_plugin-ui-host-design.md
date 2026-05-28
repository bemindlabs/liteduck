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

> **Implementation note (opaque origin).** Because the iframe has no `allow-same-origin`, its
> messages arrive with `event.origin === "null"`. The host therefore authenticates inbound
> messages by **`event.source === frame.contentWindow`** (the exact frame), never by origin
> string. The host posts to the frame via that same `contentWindow` reference.

## Capability gating

- The UI may only call commands the plugin declared (`commands[].id`). A forged `commandId` is
  rejected host-side.
- `open-external` requires the plugin's `network: true` + an `https:` URL + (Phase 2) a
  per-plugin user grant.
- No filesystem, no process spawn, no clipboard beyond what a declared command yields. The
  declared `paths` / `network` from the manifest remain the ceiling.

## CSP

- Host window: **unchanged** (`script-src 'self'`).
- See the spike finding below — running plugin scripts under the host CSP is **not** possible
  with `srcdoc`; the plugin UI must load from a **separate origin** (custom URI scheme) whose
  CSP we set per-response. The host window's own `script-src 'self'` stays untouched.

## ⚠ Spike finding (2026-05-28) — `srcdoc` cannot isolate AND execute

Building the Phase-1 scaffold surfaced a blocker in the `srcdoc` approach above:

- A **sandboxed `srcdoc` iframe inherits the embedder's CSP**. With the host CSP at
  `script-src 'self'` (no `'unsafe-inline'`), the bootstrap's inline `<script>` — and any
  injected plugin script — is **blocked**. CSPs compose as an intersection, so a child `<meta>`
  CSP cannot loosen the inherited `'self'`.
- The two escapes both fail the goal:
  - Loosen the **host** CSP to `'unsafe-inline'`/`blob:` → weakens the *whole app*'s XSS
    posture. Rejected — it betrays the security model ADR-002 is built on.
  - Load the frame from app origin (`/plugin-host.html`) **without** sandbox → same origin as
    the host → plugin code can reach the parent + Tauri `invoke`. Rejected — no isolation.

**Conclusion (revises the Isolation model above):** to *both* isolate from the host *and* run
plugin scripts, the plugin UI must be served from a **separate origin with its own CSP** —
i.e. a **custom URI scheme** registered in Tauri (`register_uri_scheme_protocol("plugin", …)`),
serving `plugin://…/<id>/ui.html` + the bundle with a per-response `Content-Security-Policy`,
loaded in a **cross-origin iframe**. This mirrors VS Code's `vscode-webview://` design. The
host↔plugin **postMessage bridge, command gating, and `event.source` auth are unchanged**; only
the *delivery + isolation mechanism* changes from `srcdoc` to a custom scheme.

**Status:** groundwork landed (manifest `ui` field, `plugin_read_ui`, frontend types). The
custom-scheme renderer + the bwoc proving bundle + PluginsPanel wiring are **held pending the
operator's decision** to build the protocol (a real subsystem, larger than the original spike
framing).

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

## Resolved decisions (operator-approved 2026-05-28)

1. **Proving plugin: `bwoc` first.** Simplest payload (no auth/network, small `{agents:[…]}`),
   so the Phase-1 spike proves the *host mechanism* (sandbox + bridge + render) without rich-UI
   noise. `jira` is the first rich showcase right after.
2. **Bundle authoring: a small starter template in the registry.** Phase 1 ships only enough to
   build the proving plugin (a hand-written `ui.js` needs no bundler); the full typed
   `@liteduck/plugin-ui` SDK + bundling recipe is Phase 3.
3. **Surfaces: `page` only in Phase 1.** Full editor-area slot = simplest layout/resize, fewest
   variables. The `panel` surface (with the `resize` bridge message) is Phase 2.
4. **Signing: `verified` + install consent for v1; defer bundle signing to Phase 3.** The
   opaque-origin sandbox already bounds blast radius; signing (key management, trust roots) is
   premature before the model is proven.

**Framing decision:** declarative views remain the **primary** path; the JS host is the
**escape hatch** for the minority of plugins that need bespoke UI — not a migration target for
every plugin. This keeps the executable-code surface small.
