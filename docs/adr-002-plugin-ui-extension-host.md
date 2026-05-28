# ADR-002: Plugin UI Extension Host (VS Code-style plugin UIs)

> **Status:** Accepted (2026-05-28) — Phase 1 shipped: the `plugin://` UI host + the bwoc
> proving bundle. Hardening (sandbox attr, install-time consent) + the jira showcase are Phase 2.
> **Date:** 2026-05-28
> **Scope:** Plugin system architecture + product charter
> **Supersedes (in part):** the **"no JS extension host"** stance recorded in
> `notes/2026-05-28_plugin-system-design.md`, `notes/2026-05-28_plugin-declarative-views.md`,
> VISION.md, and the spirit of [ADR-001](adr-001-single-direction.md). It does **not**
> reinstate any AI / agent / chat feature.

---

## Context

LiteDuck's plugin system is deliberately **declarative + shell**: a plugin is a folder with a
`plugin.json` manifest whose commands run as shell subprocesses; the plugin emits **data** and
LiteDuck renders it with **trusted built-in components** (`view: text | table | list | keyvalue
| markdown`). A plugin JS/HTML host was **explicitly rejected** because, as written in the
plugin design notes, "a plugin JS host reintroduces exactly the AI/agent/chat surface area
LiteDuck removed."

The declarative model has a ceiling. It renders the shapes the host knows about and nothing
else: a plugin cannot ship a custom layout, an interactive form beyond a flat param row, a
chart, a multi-pane view, or any bespoke interaction. The operator wants **VS Code-style
plugins that own their own UI** and live **with the plugin in the registry**
(`liteduck-plugins/plugins/<id>/`), so the look of a plugin ships and versions with the plugin
rather than being gated on a LiteDuck release.

Three interpretations of "plugin owns its UI" were weighed:

1. **Richer declarative spec** in the plugin folder (columns/labels/badges). Charter-safe but
   still ceilinged — the host can only render what it already understands.
2. **Relocating the host renderers** into the registry repo. Pure file-shuffling: the renderers
   stay compiled into the app, plugins still cannot define their own look, and it adds build
   coupling. No goal served.
3. **A JS extension host** — plugins ship executable UI that the app loads and runs. This is the
   only option that actually lets a plugin define arbitrary UI. It is also the option ADR-001
   and the plugin notes closed.

The operator chose option 3 with full knowledge of the trade-off. This ADR records that
decision and, critically, **constrains how** it is done so the original safety goals survive.

## Decision

**Introduce a plugin UI extension host. A plugin MAY ship executable UI that LiteDuck loads and
runs — but only inside a strongly-isolated sandbox, never in the host window.**

Concretely:

1. **Isolation: sandboxed `<iframe>`, not in-process.** Plugin UI runs in an `<iframe
   sandbox="allow-scripts">` with **no `allow-same-origin`** → an opaque origin that cannot
   reach the host's DOM, storage, cookies, or the Tauri `invoke` bridge. In-process loading
   (importing plugin JS into the main window) is **rejected** — it would give plugin code the
   app's full privileges.
2. **Narrow postMessage bridge.** The iframe talks to the host only through a versioned,
   allow-listed `postMessage` API (`run-command`, `command-result`, `init`, `resize`, gated
   `open-external`, `log`). A plugin can invoke **only the commands it declared** in its
   manifest; it gets back exactly the stdout those commands already produce. No new capability
   is granted to the UI beyond what the plugin's declared shell commands already had.
3. **CSP unchanged for the host.** The host window keeps `script-src 'self'`. Plugin JS is
   loaded into the sandboxed iframe via `srcdoc` / `blob:`; the host page never executes
   plugin script.
4. **Declarative stays the default.** A plugin with no `ui` entry renders exactly as today
   (declarative views) — fully backward compatible. The JS host is **opt-in** per plugin.
5. **The scope-ceiling deny-list is retained and unchanged.** A plugin still cannot declare a
   `chat` / `agent` / `llm` `kind`; a rich UI does not become an AI surface.
6. **Install-time consent.** Installing a plugin that ships executable UI surfaces that fact
   plus the plugin's declared capabilities, before anything touches disk.

The full mechanism — bridge message schema, package layout, loading lifecycle, capability
gating, phasing — is specified in `notes/2026-05-28_plugin-ui-host-design.md`.

## Consequences

**Positive**

- Plugins can ship arbitrarily rich, interactive UIs that version with the plugin in the
  registry — the operator's goal, "UI lives with the plugin."
- The host stays lean: the JS host is a small loader; per-plugin UI weight ships with the
  plugin, installed on demand (see the lean-distribution change that removed bundled plugins).
- Backward compatible: every existing declarative plugin keeps working untouched.

**Negative / trade-offs (explicit)**

- **This re-opens an execution surface ADR-001 closed.** LiteDuck now loads and runs
  third-party code. The mitigations above (opaque-origin sandbox, allow-listed bridge,
  capability gating, install consent) bound the blast radius, but the "runs no third-party
  code" property of the editor-only era is gone.
- **More surface to design, test, and version.** The bridge API is a compatibility contract;
  breaking it breaks installed plugins.
- **Charter docs must be updated on ratification** (tracked below) — the "no JS host" language
  in VISION.md, ROADMAP.md, CLAUDE.md, and the two plugin notes becomes historical.

## What is explicitly NOT changing

- No AI / LLM / inference, no agents, no chat — the `chat`/`agent`/`llm` deny-list stands.
- The host app's privileges are **not** exposed to plugin UI; the Tauri `invoke` surface is
  never reachable from the iframe.
- The shell-command user-trust sandbox is unchanged; the JS UI is an additional, isolated
  surface, not a widening of command privileges.
- The four core capabilities (editor, terminal, Git, Settings) are untouched.

## Ratification checklist

- [x] Land Phase 1 — the `plugin://` custom-scheme host + bridge + bwoc proving bundle.
- [x] Update VISION.md — clarify that the isolated plugin UI host is sanctioned extensibility.
- [x] Update ROADMAP.md — record the plugin UI host under shipped/in-progress.
- [x] Update CLAUDE.md (liteduck) — the Plugin System section + lean (registry) distribution.
- [x] Mark the no-JS-host rationale in the two plugin notes as superseded by this ADR.
- [x] Phase 2 — `sandbox` attr (with explicit-scheme CSP), install-time "ships executable UI"
      consent, and the jira showcase bundle. Graceful `ready`-timeout fallback to declarative.
- [x] Phase 3a — author SDK: typed `window.liteduck` bridge (`liteduck-plugins/sdk/bridge.d.ts`),
      authoring guide, a copy-paste `templates/ui-plugin/`, the `ui` JSON-schema, and a bundling
      recipe.
- [ ] Phase 3b — capability grants (gated `open-external`), bridge versioning policy, and
      (optional) bundle signing.

---

*LiteDuck: do less, better — and when we do more, do it isolated.*
