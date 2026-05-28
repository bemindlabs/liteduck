# LiteDuck plugin system — design options

> Status: brainstorm / design note (no implementation). Owner: TBD.
> Scope guardrail: any plugin model must not reintroduce AI/LLM, autonomous
> agents, chat, remote orchestration, or always-on cloud — per [VISION.md](../VISION.md)
> and [ADR-001](../docs/adr-001-single-direction.md).

## Executive summary

LiteDuck is deliberately narrow (file browser+editor, terminal, Git, settings).
A plugin system is a strategic risk: it is the single fastest way to drift back
toward the "LoopDuck" surface area that VISION.md explicitly rejects. The
recommendation is therefore the **most conservative model that still unlocks
real user value**: a **Hybrid — declarative manifest + shell command (option
4)**.

A LiteDuck plugin is a folder under `~/.liteduck/plugins/<id>/` containing
`plugin.json` (declares commands, menus, keybindings, file-association preview
hooks, status-bar items, settings panel entries) plus optional shell commands
or static assets. There is **no embedded JS/Wasm runtime**, **no plugin-side
React**, and **no in-process plugin code**. Plugins extend the UI by
*declaration* and extend behavior by *spawning a child process* that LiteDuck
brokers through the existing PTY/IPC paths.

The single strongest reason: it preserves LiteDuck's three load-bearing
properties — small bundle, calm UX, local-first/private — while still
delivering 80% of the practical wins (formatters, linters, custom previewers,
quick scripts, project scaffolders). Anything richer (VS Code-class
extensions) is *reversible to* this model later; the reverse — adopting a JS
runtime then trying to take it back — is not.

## Plugin approaches compared

### 1. VS Code-style extensions (JS/TS bundles + manifest + marketplace)

**What it is.** Each plugin is a bundled JS/TS module (or Wasm component)
loaded into a sandboxed runtime inside the app. Plugins call a documented host
API (`window.liteduck.*`) to register commands, mutate panels, contribute
language servers, etc. A marketplace serves signed bundles.

**Implementation cost (L).** Components needed:
- JS isolate / Wasm runtime embedded in the Tauri webview (e.g. a hidden
  per-plugin iframe with `postMessage` bridge, or `wasmtime` on the Rust side).
- A stable `liteduck-plugin-api` package (versioned, semver-locked).
- Permission ACL grammar layered on top of Tauri v2 capabilities.
- Bundle resolver, install/uninstall UX, update checker.
- Marketplace backend (CDN + index API + signing pipeline) or a "sideload-only"
  fallback.
- Crash isolation (one plugin must not freeze the editor).
- Public API stability commitment — effectively forever.

**Security surface.** Largest of the four. Even sandboxed JS plugins want
filesystem, network, secrets, and PTY access; once granted, exfiltration is
trivial. The Tauri capability system helps but does not eliminate the issue.
Signing + reviewer pipeline is mandatory, which means LiteDuck becomes a
distribution platform.

**Use cases unlocked.** Everything VS Code does — LSP, themes with logic,
debuggers, rich previewers, refactoring tools.

**Fit with "lightweight, focused" philosophy.** Poor. Embedding a JS runtime
and shipping a public API contradicts pillars 1, 2, and 4 of VISION.md.
Marketplace pressure pulls toward AI/agent extensions that ADR-001 forbids.

**Migration cost if abandoned later.** Very high. Existing plugins break,
users churn, the public API contract has to be sunset with a deprecation
window measured in years.

### 2. Obsidian-style folder drop-in

**What it is.** Plugins are folders under a known directory (`~/.liteduck/plugins/<id>/`)
with a `manifest.json` and a `main.js` loaded into the renderer at startup.
Like Obsidian, the API is mostly DOM + event bus; plugins are expected to
patch the running app.

**Implementation cost (M–L).** Lighter than VS Code-style because no separate
runtime — but you must:
- Define and stabilise a JS host API.
- Decide what part of the React tree is plugin-extensible.
- Add a plugin loader at app boot, with isolation between plugins (one bad
  plugin must not crash the others).
- Settings UI per plugin, enable/disable, update channel.

**Security surface.** Effectively the same as #1 once `main.js` runs in the
renderer — full DOM, full IPC, full host privileges unless aggressively
sandboxed. Obsidian itself does not sandbox; community plugins can read any
file on disk.

**Use cases unlocked.** Custom panels, custom commands, third-party UI
contributions. Slightly fewer than #1 (no LSP unless you build the bridge).

**Fit with "lightweight, focused" philosophy.** Poor-to-mixed. Less ceremony
than VS Code, but the security and scope-creep concerns are nearly identical:
once a JS plugin can mount a panel, "an AI chat panel" is a 50-line plugin.

**Migration cost if abandoned later.** High. Same dynamic as #1.

### 3. Command-tools / external-CLI wrappers (npm-like, prettier/eslint/ripgrep as plugins)

**What it is.** A plugin is just a known CLI on `PATH` plus a small JSON entry
registering when LiteDuck should invoke it (e.g. format-on-save, status-bar
linter, "Find in files" via ripgrep). LiteDuck shells out via the existing
PTY/`std::process` paths; no embedded runtime.

**Implementation cost (S).** Components needed:
- A `~/.liteduck/tools.json` (or per-tool entries under settings) declaring:
  binary, args template, trigger event, output handler (stdout JSON / plain
  text / diagnostics).
- A small Rust dispatcher in `src-tauri/src/` that resolves the tool, runs it
  under the existing `bash_validator`/scope rules, and emits a typed event.
- Settings UI to add/remove/edit tool entries.

**Security surface.** Smallest. The user is already trusting any binary on
their `PATH`; LiteDuck adds no new attack surface beyond the trigger.

**Use cases unlocked.** Format-on-save (prettier, rustfmt, gofmt), inline
diagnostics (eslint, ruff, clippy), project search (ripgrep), scaffolders
(create-react-app-like). **Not** unlocked: new UI panels, custom keybindings,
new menu entries, status-bar items, custom file previewers.

**Fit with "lightweight, focused" philosophy.** Excellent. Pure
configuration; no public API contract; no marketplace.

**Migration cost if abandoned later.** Trivial. The JSON entries become
dead config; no third-party code to deprecate.

### 4. Hybrid: declarative manifest + shell command

**What it is.** A LiteDuck plugin is a folder under `~/.liteduck/plugins/<id>/`
with:

- `plugin.json` — declares **contributions** (commands, menu items, keybindings,
  file-association handlers, status-bar items, settings panel entries,
  preview renderers by mime/extension) and **triggers** (when to run).
- Optional `bin/` or a `command` field — a shell command LiteDuck spawns when
  a contributed command fires. stdin/stdout is the contract (LiteDuck pipes
  the active file path, selection, workspace root; reads back typed JSON for
  diagnostics, edits, preview HTML, or plain stdout for the terminal).
- Optional `assets/` — static SVG/PNG/CSS the manifest can reference (icons,
  preview stylesheets).

No JS runs in the LiteDuck process. No public JS API. The plugin's *only*
host surface is the manifest schema + the stdin/stdout protocol.

**Implementation cost (M).** Components needed:
- Versioned `plugin.json` schema (JSON Schema, served from `~/.liteduck/`
  docs).
- Loader in `src-tauri/src/plugins.rs` that scans `~/.liteduck/plugins/`,
  validates manifests, and maintains a registry.
- Contribution surface in the frontend: command palette (`src/lib/commands.ts`
  already has a contribution-friendly registry), menu builder (`app_menu.rs`),
  keybinding map, status-bar slot, preview renderer slot.
- IPC surface: 4–6 new `#[tauri::command]`s — `plugins_list`,
  `plugins_enable`, `plugins_disable`, `plugins_run_command`,
  `plugins_install_from_folder`, `plugins_reload`.
- Subprocess broker reusing the existing `bash_validator` + scoped path
  rules; output parser for the typed-JSON protocol.
- Settings UI: list + toggle + "open folder" + "view logs".
- Sample plugin (e.g. `prettier-format-on-save`) shipped in `examples/`.

**Security surface.** Small. Plugins run as separate processes with the same
privilege as the user, exactly like option #3. The host doesn't load plugin
code into its own address space. The manifest can only declare *what to
contribute*, not *what to execute against the LiteDuck internals* — there is
no host API to abuse.

**Use cases unlocked.** Formatters, linters with diagnostics, custom
previewers (mermaid, csv, jupyter-notebook view), project scaffolders, quick
scripts on a keybinding, status-bar tools (git-author, line-count), per-mime
"open with" handlers. **Not** unlocked: live language servers (out of scope),
in-process UI components (deliberately out of scope).

**Fit with "lightweight, focused" philosophy.** Strong. The manifest is
declarative — the same conceptual category as a Tailwind config or a VS Code
`tasks.json`. There is no JS API to stabilise, no marketplace pressure, and
no obvious path from "I wrote a plugin.json" to "I built an AI agent in
LiteDuck".

**Migration cost if abandoned later.** Low–medium. Manifests become dead
config; sample plugin retired; loader can be feature-flagged off. No third
party shipped a JS bundle against a host API, so there is no SDK to sunset.

## Comparison matrix

| Dimension | VS Code | Obsidian | Command-tools | Hybrid |
|---|---|---|---|---|
| Impl complexity | L (runtime + API + market) | M–L (loader + API) | S (config only) | M (manifest + broker) |
| Security surface | Largest (in-process JS) | Largest (in-process JS) | Smallest (user-owned bin) | Small (subprocess only) |
| Lightweight fit | Poor (runtime weight + API) | Mixed (no runtime but full DOM) | Excellent | Strong |
| Use cases unlocked | Highest (LSP, debug, themes) | High (panels, commands) | Medium (CLI-only) | High (UI contrib via declaration) |
| Marketplace story | Required (signing + CDN) | De-facto required | None needed | Optional (start with sideload) |
| Reversibility | Very high cost to sunset | High cost to sunset | Trivial | Low–medium cost to sunset |

## Recommendation

Adopt **option 4 (Hybrid: declarative manifest + shell command)**.

It is the only model that simultaneously satisfies three hard constraints:
(a) preserves the VISION.md pillars — lightweight, focused scope,
local-first/private; (b) does not expose a JS host API that would have to be
versioned and supported indefinitely, which is the documented cause of
scope-creep in editor projects of this size; (c) leaves a clean retreat path —
if plugins underperform, the loader is feature-flagged off and the manifests
become inert without breaking a single third-party bundle.

It is also the only model where the answer to "can a plugin add an AI chat
panel?" is structurally **no** — the contribution schema doesn't include a
"mount arbitrary React tree" slot. ADR-001 is enforced by the schema, not by
review discipline.

The cost is real but bounded: roughly one focused sprint for the loader +
manifest schema + four contribution slots, plus a second sprint to wire
install/uninstall UX and ship one reference plugin. That fits a P1 line on
ROADMAP.md without displacing the P0 reliability/test-coverage work currently
in progress.

## Phased rollout plan for the recommendation

### Phase 1 — Foundations (1–2 weeks)

- Draft `plugin.json` v0 schema (JSON Schema + EN docs).
- Implement `~/.liteduck/plugins/` scanner in a new `src-tauri/src/plugins.rs`
  module behind a feature flag.
- Add IPC commands: `plugins_list`, `plugins_enable`, `plugins_disable`,
  `plugins_reload`. Wire into `src-tauri/src/lib.rs` invoke handler.
- Frontend wrapper `src/lib/plugins.ts` mirroring the IPC surface.
- Deliverables: schema doc at `docs/design-plugin-system.md`, loader, IPC
  surface, `npm test`/`cargo test` coverage for the loader.

### Phase 2 — Contribution surfaces (1–2 weeks)

- Contribution: **command palette** (extend `src/lib/commands.ts` to merge
  plugin-contributed commands).
- Contribution: **keybindings** (extend `useKeyboardShortcuts` to register
  plugin keybindings, with conflict detection against built-ins).
- Contribution: **subprocess broker** — spawn the plugin's `command` with
  scoped env, pass file/selection via stdin JSON, parse typed stdout
  (`{kind:"edit"|"diagnostic"|"preview"|"log", ...}`).
- Sample plugin: `prettier-format-on-save` shipped in `examples/plugins/`.
- Deliverables: sample plugin, end-to-end test (Playwright) that loads the
  sample and exercises the "format current file" command.

### Phase 3 — UX + extra slots + distribution (1–2 weeks)

- Settings UI: Plugins section (list, enable/disable, open folder, view
  logs, uninstall).
- Contribution: **status-bar items** + **per-mime preview renderers** +
  **menu items** (via `app_menu.rs`).
- Install UX: drag-folder-to-install and "Install from URL" (downloads a
  tarball into `~/.liteduck/plugins/<id>/`; no auto-execution beyond a
  declared `postinstall` *script the user must approve*).
- Decide marketplace posture (see open questions). The recommended default is
  "sideload only for v1; marketplace deferred".
- Deliverables: settings UX, install/uninstall flows, one second sample
  plugin exercising preview renderer + status bar, user-facing docs page.

## Open questions for the operator

1. **Signing & trust model.** v1 sideload-only with a one-time "I trust this
   plugin" confirmation, or do we require ed25519-signed plugins from day
   one? Signing pushes us toward operating a key/registry; sideload-only
   ships sooner but trades off auditability.
2. **Marketplace hosting.** If we ever ship a marketplace, is it a GitHub
   Releases-style "curated index in this repo" model (zero infra), an
   `npm`-backed namespace (`@liteduck/plugin-*`), or a custom CDN?
   Recommendation in this note is "defer entirely until real demand";
   confirm.
3. **Deprecation policy.** What is the support window for the `plugin.json`
   schema? Proposal: minor versions are additive only; major-version bumps
   keep the prior major loadable for two CalVer release cycles
   (~6 months). Acceptable?
4. **Default-vs-optional plugins.** Do we ship *any* plugins bundled with
   LiteDuck (e.g. a built-in `prettier` integration) or is every plugin
   opt-in? Bundling helps adoption but blurs "focused core" — preference?
5. **Sandbox boundary.** Subprocess plugins inherit the user's full
   privileges by default. Do we want to add a default-deny scope (no
   network, no path outside the active workspace) togglable per plugin,
   or stay "user-trust" for v1?
6. **Telemetry on plugin failures.** ADR-001 forbids cloud telemetry.
   Confirm that plugin error reporting stays local-only (logs in
   `~/.liteduck/logs/plugins/<id>.log`) and never phones home, even
   opt-in.
7. **Scope ceiling enforcement.** Should the manifest schema *explicitly*
   reject contribution kinds that would reintroduce out-of-charter
   features (e.g. `kind: "chat"`, `kind: "agent"`, `kind: "llm"`)? Or is
   ADR-001 enforced only by what slots we *do not* define? Recommendation:
   define an explicit deny-list in the schema and refuse to load any
   manifest that uses one.
