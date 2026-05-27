# ADR-001: Single Direction — AI-Driven, Human-in-the-Loop, Markdown-First

> **Status:** Accepted
> **Date:** 2026-04-09
> **Scope:** All LiteDuck storage, settings, and workflow architecture
> **Resolves:** 7 backlog conflicts identified in scrum analysis

---

## Decision

LiteDuck's entire architecture follows **one direction**:

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   AI agents are the primary actors.                                │
│   Humans monitor, approve, modify, or reject.                      │
│   All data is markdown + JSON (human-readable, git-friendly).      │
│   SQLite is for runtime state only (caches, sessions, indices).    │
│   One read chain. One write chain. No parallel paths.              │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Principles

### P1: Markdown+JSON is the Source of Truth

All persistent data that a human or agent might read, edit, or version-control is stored as **markdown or JSON files**. SQLite is only for:
- Runtime indices (fast lookup of what's on disk)
- Ephemeral session state (PTY sessions, WebSocket connections)
- Caches (keychain TTL, model metadata)

SQLite is **never** the source of truth for user data.

### P2: One Read Chain, One Write Chain

Every setting, every piece of data follows a single resolution path:

```
READ:  Task override → Agent profile → Workspace file → Group file → Global file → Built-in default
WRITE: Write to the most specific applicable layer. Emit change event.
```

No parallel read-throughs. No "check JSON first, fall back to SQLite." The JSON file IS the data. SQLite is a cache that can be rebuilt from files.

### P3: AI Drives, Human Supervises

The workflow is always:

```
AI proposes → Impact Analysis → Auto-apply (low risk) or Human gate (high risk)
```

Humans have exactly three actions at gates: **Approve / Modify / Reject**. Everything else is automated. This applies to code, scrum, settings, and memory.

### P4: Workspace-as-Directory

A workspace is self-contained in its directory. Moving the directory moves all data. No external database references.

```
<workspace>/
├── .LiteDuck/          # All LiteDuck workspace data
│   ├── config.json     # Workspace settings override
│   ├── scrum.db        # SQLite INDEX of scrum markdown files
│   ├── scrum/          # Scrum data (markdown, source of truth)
│   ├── agents/         # Workspace agent sessions & memory
│   ├── chat/           # Chat history (markdown + SQLite index)
│   ├── automations/    # Automation definitions (JSON)
│   └── mcp/            # Workspace MCP server configs (JSON)
├── agents/             # Agent profiles (markdown, git-committed)
└── CLAUDE.md
```

---

## Conflict Resolutions

### Conflict 1: Scrum Storage — Markdown Wins

**Decision:** Markdown files in `<workspace>/.LiteDuck/scrum/` are the source of truth. SQLite (`scrum.db`) is a **read index** rebuilt from markdown on startup.

**Why:** LD-11 already implemented markdown-driven scrum. The vision is git-friendly, human-readable data. SQLite queries are fast but files are portable.

**Impact on stories:**
- **LD-11** (done): Already correct direction
- **LD-38** (backlog): **REWRITE** — Instead of adding `WHERE workspace` to SQLite, rewrite to use `scrum_md.rs` as primary, with SQLite as optional index for performance. Tasks become:
  - T1: Ensure `scrum_md.rs` accepts workspace path in all functions
  - T2: Build SQLite index that mirrors markdown state (auto-rebuild on startup)
  - T3: ScrumPage passes workspace from `useWorkspace()`
  - T4: Remove direct SQLite scrum queries from `scrum.rs` (delegate to `scrum_md.rs`)

### Conflict 2: Settings Read Chain — Single Path

**Decision:** One chain, no fallbacks:

```
resolve_setting(key, workspace):
  1. <workspace>/.LiteDuck/config.json   → workspace override
  2. ~/.LiteDuck/config.json             → global default
  3. Built-in Rust default               → hardcoded fallback
  
  For secrets:
  4. OS keychain                         → always (never in files)
```

`settings.db` is **deprecated**. During migration period only, `settings.db` is read IF `~/.LiteDuck/config.json` doesn't exist yet. After migration, `settings.db` is ignored.

**Impact on stories:**
- **LD-28**: Simplified — `home_config_read()` reads JSON, returns typed Config. No read-through to SQLite. Remove T6 (read-through layer).
- **LD-35**: Simplified — `resolve_config(workspace)` merges two JSON files. No SQLite involvement.
- **LD-36**: Migration wizard exports `settings.db` → `config.json` **once**, then `settings.db` is archived.
- **LD-43**: `useConfig()` hook calls `resolve_config(workspace)` via Tauri. Replaces all `getSetting()` calls. No legacy shim needed — migration is a one-time event.

### Conflict 3: MCP Storage — JSON Replaces SQLite

**Decision:** `~/.LiteDuck/mcp/servers.json` (global) + `<workspace>/.LiteDuck/mcp/servers.json` (workspace) replace `mcp.db`.

**Why:** Aligns with P1 (markdown+JSON source of truth). MCP server configs are small, structured, and benefit from being human-editable and git-committable.

**Impact on stories:**
- **LD-34**: Writes to JSON. No SQLite merge. Reads union of global + workspace JSON files.
- **LD-16** (done): `mcp.rs` runtime state can use in-memory cache. Persistent config moves to JSON.
- **LD-36**: Migration exports `mcp.db` → JSON files, preserving workspace scoping via file location.

### Conflict 4: Agent Memory — Unified Search with Budget

**Decision:** `find_relevant_notes()` searches all layers with budget allocation:

```
Search order:  Agent (30%) → Workspace (25%) → Group (20%) → Global (15%) → Shared (10%)
```

**Impact on stories:**
- **LD-31**: Must update `find_relevant_notes()` in `agent_memory.rs` to accept a layer list and search multiple directories.
- **LD-15** (done): No change — agent memory stays at `<ws>/agents/<slug>/memory/`.
- New task on LD-31: "Update `find_relevant_notes()` to search agent → workspace → global with configurable budget."

### Conflict 5: workspace_init — Dirs Match Storage

**Decision:** `workspace_init()` only creates directories that will contain files:

```
.LiteDuck/
├── config.json         # Created empty (or from template)
├── scrum/              # Scrum markdown files go here
├── agents/             # Agent session state
├── chat/               # Chat markdown logs
├── automations/        # Automation JSON definitions
└── mcp/                # Workspace MCP server JSON configs
```

No empty directories for features that use SQLite. Every directory has files.

**Impact on stories:**
- **LD-37**: Update subdirectory list to match actual file storage.

### Conflict 6: Automations — JSON Files, Not SQLite Column

**Decision:** Automations stored as JSON files:
- Global: `~/.LiteDuck/automations/<slug>.json`
- Workspace: `<workspace>/.LiteDuck/automations/<slug>.json`

SQLite `automations.db` becomes a runtime execution log only (run history, timestamps).

**Impact on stories:**
- **LD-39**: **REWRITE** — Instead of `ALTER TABLE ADD COLUMN workspace`, rewrite to read automation definitions from JSON files, scoped by directory location. SQLite tracks run history only.

### Conflict 7: Epic Priorities — Sequential, Not Parallel

**Decision:** Explicit execution order:

```
Sprint 1: EPIC-8 (foundation)     — ~/.LiteDuck, config, profile, memory, agents
Sprint 2: EPIC-9 + EPIC-10        — Workspace isolation + Settings redesign (parallel OK)
Sprint 3-5: EPIC-11               — AgentsCouncil-to-Dev Mode (depends on EPIC-8+9)
```

EPIC-11 label stays `critical` but is explicitly Sprint 3+. EPIC-8 is Sprint 1 (must complete first).

---

## Storage Decision Matrix

| Data | Source of Truth | Format | Location | SQLite Role |
|------|----------------|--------|----------|-------------|
| App settings | config.json | JSON | `~/.LiteDuck/` + `<ws>/.LiteDuck/` | None (deprecated) |
| Secrets | OS keychain | N/A | System keychain | None |
| User profile | profile.md | Markdown | `~/.LiteDuck/` | None |
| Workspace registry | workspaces.json | JSON | `~/.LiteDuck/` | None |
| Scrum (projects, stories) | Markdown files | Markdown | `<ws>/.LiteDuck/scrum/` | Optional index |
| Agent profiles | profile.md | Markdown | `<ws>/agents/` + `~/.LiteDuck/agents/` | None |
| Agent memory | Note .md files | Markdown | 5-layer hierarchy | None |
| Chat history | Message .md logs | Markdown | `<ws>/.LiteDuck/chat/` | Session index |
| Automations (definitions) | JSON files | JSON | `<ws>/.LiteDuck/automations/` + `~/.LiteDuck/automations/` | Run history only |
| MCP servers | servers.json | JSON | `<ws>/.LiteDuck/mcp/` + `~/.LiteDuck/mcp/` | None |
| LLM providers | providers.json | JSON | `~/.LiteDuck/` | None |
| CLI tools | tools.json | JSON | `~/.LiteDuck/` | None |
| Workspace groups | groups.json | JSON | `~/.LiteDuck/` | None |
| AgentsCouncil sessions | Markdown + JSON | Mixed | `<ws>/.LiteDuck/.agents-council/` | None |
| Terminal PTY sessions | In-memory | N/A | Runtime only | None |
| Logs | Log files | Text | `~/.LiteDuck/logs/` | None |

---

## The Single Workflow

Every feature in LiteDuck follows this workflow:

```
                    ┌─────────────────────────────┐
                    │     AI Agent Proposes        │
                    │     (or System Detects)      │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     Impact Analysis          │
                    │     (automatic, always)      │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────┴───────────────┐
                    │                              │
                    ▼                              ▼
          ┌──────────────┐              ┌──────────────┐
          │   Low Risk   │              │  High Risk   │
          │  Auto-apply  │              │  Human Gate  │
          │  + Log IAR   │              │  + Show IAR  │
          └──────────────┘              └──────┬───────┘
                                               │
                                  ┌────────────┼────────────┐
                                  │            │            │
                                  ▼            ▼            ▼
                            ┌─────────┐  ┌─────────┐  ┌─────────┐
                            │ Approve │  │ Modify  │  │ Reject  │
                            └────┬────┘  └────┬────┘  └────┬────┘
                                 │            │            │
                                 ▼            ▼            ▼
                              Apply      Re-analyze     Log &
                              + Log      with changes   Archive
                              IAR        (loop back)    
```

This applies to:
- **Code changes** — Agent writes code → QG/SG gates → Human approves PR
- **Scrum decisions** — Council proposes sprint → IAR → Human approves/modifies
- **Settings changes** — Agent or human changes config → IAR on high-risk changes
- **Memory propagation** — Agent learns something → propagation rules → auto or gated
- **Automation execution** — Trigger fires → action proposed → risk-gated

---

## Migration Path

```
Phase 1 (Sprint 1): Build ~/.LiteDuck + config.json + profile.md + workspaces.json
                     settings.db still works, but config.json is primary

Phase 2 (Sprint 2): Migrate workspace data to .LiteDuck/ directories
                     One-time migration wizard for settings.db → config.json
                     After migration: settings.db archived, not read

Phase 3 (Sprint 3+): AgentsCouncil uses only the new file-based system
                      No SQLite dependencies for user data
```

---

## Backlog Story Updates Required

| Story | Change | Reason |
|-------|--------|--------|
| **LD-28** | Remove T6 (read-through layer) | Single chain, no SQLite fallback |
| **LD-35** | Simplify — merge two JSON files only | No SQLite in chain |
| **LD-38** | Rewrite — scrum_md.rs as primary, SQLite as index | Markdown source of truth |
| **LD-39** | Rewrite — JSON files, not SQLite column | File-based automations |
| **LD-43** | Remove T5 (legacy shim) | No backward compat needed post-migration |
| **LD-37** | Update subdirs to match file storage | Dirs = files, not SQLite |
| **LD-31** | Add task: unified multi-layer search in find_relevant_notes() | Memory budget allocation |
| **LD-34** | JSON only, no SQLite merge | Consistent with P1 |
