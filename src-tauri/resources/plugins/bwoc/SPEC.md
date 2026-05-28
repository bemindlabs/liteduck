# BWOC Orchestration Plugin (LiteDuck)

An **opt-in** plugin under LiteDuck's plugin system (hybrid: declarative
manifest + shell command, design note `2026-05-28_plugin-system-design.md`).
LiteDuck core has **no integrations** — this was formerly a baked-in native
integration (`src-tauri/src/bwoc.rs` + `src/lib/bwoc.ts`) and has been ported to
a plugin so it does nothing unless the user installs and runs it. It is
**read-only**: LiteDuck never spawns, stops, or modifies BWOC agents.

## Layout

```
bwoc/
  plugin.json   declares id/name/version/kind/commands (network=false, no paths)
  bwoc.sh       POSIX shell — runs the external `bwoc` CLI, emits JSON to stdout
  SPEC.md       this file
```

The bundled copy ships under `src-tauri/resources/plugins/bwoc/`. The user
installs it to `~/.liteduck/plugins/bwoc/` via the Plugins panel install action
(or by copying the folder). Nothing runs until the user installs it and clicks a
command — there is no startup detection.

## Manifest (`kind: integration`, `network = false`)

No network access and no declared host paths — the plugin only shells out to the
local `bwoc` binary. It carries no credentials.

## Commands

| id            | title               | verb     | underlying                         |
|---------------|---------------------|----------|------------------------------------|
| `bwoc.detect` | BWOC: Detect CLI    | `detect` | `command -v bwoc` + `bwoc --version` |
| `bwoc.list`   | BWOC: List Agents   | `list`   | `bwoc list` (lenient row parsing)  |

`detect` emits `{installed, version, path}` (`installed:false` when the binary is
absent — a missing optional integration is a normal state, not an error).
`list` emits `{agents:[{name, role, raw}, ...]}`, parsing each row leniently and
preserving the original line in `raw`.

## Requirements

The external `bwoc` CLI must be on `PATH` for the commands to return data.
Install the BWOC Framework: https://github.com/bemindlabs/BWOC-Framework

## Deferred (NOT in v1)

- **Any write / lifecycle action** (spawn / stop / start / send) — deliberately
  out of scope; the plugin stays read-only.
- A richer agent-detail view; v1 surfaces name + role + raw row.
