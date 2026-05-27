# Design: EPIC-9 — Workspace-Scoped Data Isolation

> **Status:** Draft
> **Date:** 2026-04-09
> **Scope:** Workspace-level data isolation for scrum, automations, chat, MCP, and config
> **Depends on:** EPIC-8 (`~/.LiteDuck` home root), ADR-001 (Markdown+JSON source of truth)
> **Stories:** LD-37, LD-38, LD-39, LD-40, LD-41

---

## 1. Motivation

LiteDuck currently treats all data as globally shared. Settings live in a single `settings.db`. Automations are global rows in `automations.db`. MCP configs use a `workspace` column but still share one `mcp.db`. Chat history is workspace-local for LAN messages but routes through a global `ChatDbState`. Scrum calls pass through `crate::db::open()` — a global connection — even though `scrum_md.rs` already accepts a workspace path.

The result: opening two workspaces in the same session leaks data across project boundaries. Switching workspaces does not change which automations appear. An agent in Workspace A can read MCP configs intended for Workspace B.

EPIC-9 makes the workspace the atomic unit of isolation. After this epic:

- Every data read starts by looking in `<workspace>/.LiteDuck/` first.
- Absent a workspace override, the read falls back to `~/.LiteDuck/` (global).
- SQLite is used only where runtime performance demands it (index or run-log), and only as a cache that can be rebuilt from files.
- Moving or archiving a workspace directory moves all its data with it.

This directly implements **P4 (Workspace-as-Directory)** from ADR-001.

---

## 2. Architecture Constraint (ADR-001 Enforced)

Every design choice in this document is constrained by ADR-001. The non-negotiable rules:

```
1. Markdown + JSON is the source of truth for all user data.
2. SQLite is only for runtime indices, caches, session state.
3. One read chain: workspace file → global file → built-in default.
4. No parallel read-through paths to SQLite.
5. SQLite can always be deleted and rebuilt from files.
```

Any implementation that reads SQLite before checking the JSON file is wrong.
Any implementation that writes user state to SQLite as the primary store is wrong.

---

## 3. The `.LiteDuck/` Directory Structure

### 3.1 Full Layout

```
<workspace>/
├── .LiteDuck/                          # All LiteDuck workspace data (LD-37)
│   │
│   ├── config.json                     # Workspace config override (LD-41)
│   │
│   ├── scrum/                          # Scrum source of truth — markdown (LD-38)
│   │   ├── projects/
│   │   │   └── <project-key>/
│   │   │       ├── project.md          # Project definition
│   │   │       ├── epics/
│   │   │       │   └── EPIC-<n>.md     # Epic definition
│   │   │       ├── sprints/
│   │   │       │   └── sprint-<n>.md  # Sprint definition + item list
│   │   │       └── stories/
│   │   │           └── <key>-<n>.md   # Story / task definition
│   │   └── scrum.db                    # SQLite INDEX (not source of truth)
│   │
│   ├── automations/                    # Automation definitions — JSON (LD-39)
│   │   ├── <slug>.json                 # One file per automation
│   │   └── runs.db                     # SQLite run history (not definitions)
│   │
│   ├── chat/                           # AI chat history — markdown (LD-40)
│   │   ├── sessions/
│   │   │   └── <session-id>.md         # One file per chat session
│   │   └── sessions.db                 # SQLite session index (not messages)
│   │
│   ├── mcp/                            # MCP config workspace override (LD-41)
│   │   └── servers.json                # Workspace MCP server list
│   │
│   └── .agents/                        # Internal agent session state
│       └── memory/                     # Workspace-scoped agent memory notes
│           ├── MEMORY.md               # Memory index
│           └── *.md                    # Memory entries
│
├── agents/                             # Agent profiles (git-committed)
│   └── <agent-slug>/
│       ├── profile.md
│       ├── memory/
│       └── tasks/
│
└── CLAUDE.md
```

### 3.2 What Goes Where

| Data | File(s) | SQLite role |
|------|---------|-------------|
| Workspace preferences | `.LiteDuck/config.json` | None |
| Scrum projects, epics, sprints, stories | `.LiteDuck/scrum/projects/*/` | Index only (`scrum.db`) |
| Automation definitions | `.LiteDuck/automations/<slug>.json` | Run log only (`runs.db`) |
| AI chat messages | `.LiteDuck/chat/sessions/<id>.md` | Session index (`sessions.db`) |
| MCP server config (workspace) | `.LiteDuck/mcp/servers.json` | None |
| Agent profiles | `agents/<slug>/profile.md` | None |
| Agent memory | `agents/<slug>/memory/` or `.LiteDuck/.agents/memory/` | None |

### 3.3 Initialization (LD-37)

`workspace_init` creates the full `.LiteDuck/` skeleton on first open. It is idempotent — safe to call on an already-initialized workspace.

```rust
// src-tauri/src/workspace.rs  (extended)

/// Subdirectories created under <workspace>/.LiteDuck/ on init.
const LITEDUCK_DIRS: &[&str] = &[
    ".LiteDuck",
    ".LiteDuck/scrum",
    ".LiteDuck/scrum/projects",
    ".LiteDuck/automations",
    ".LiteDuck/chat",
    ".LiteDuck/chat/sessions",
    ".LiteDuck/mcp",
    ".LiteDuck/.agents",
    ".LiteDuck/.agents/memory",
];

/// Files created with default content on init (only if absent).
const LITEDUCK_DEFAULT_FILES: &[(&str, &str)] = &[
    (".LiteDuck/config.json", r#"{"version":1}"#),
    (".LiteDuck/mcp/servers.json", r#"{"version":1,"servers":[]}"#),
];

#[tauri::command]
pub fn workspace_init(
    app: tauri::AppHandle,
    workspace: String,
) -> Result<WorkspaceInitResult, String> {
    let ws = Path::new(&workspace);
    fs::create_dir_all(ws).map_err(|e| e.to_string())?;

    let mut created_dirs = Vec::new();
    for dir in LITEDUCK_DIRS {
        let path = ws.join(dir);
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            created_dirs.push(dir.to_string());
        }
    }

    let mut created_files = Vec::new();
    for (rel, content) in LITEDUCK_DEFAULT_FILES {
        let path = ws.join(rel);
        if !path.exists() {
            fs::write(&path, content).map_err(|e| e.to_string())?;
            created_files.push(rel.to_string());
        }
    }

    // Copy CLI template file (CLAUDE.md) if absent.
    // (existing copy_dir_skip_existing logic unchanged)
    copy_cli_templates(&app, ws, &mut created_files)?;

    Ok(WorkspaceInitResult { created_dirs, created_files, skipped: Vec::new() })
}
```

---

## 4. Workspace Config Override (LD-41)

### 4.1 Resolution Chain

```
resolve_config(workspace: Option<&str>) -> Config

  1. <workspace>/.LiteDuck/config.json   (workspace layer — highest priority)
  2. ~/.LiteDuck/config.json             (global layer)
  3. Config::default()                   (built-in Rust defaults — lowest priority)

  For any key: workspace value wins over global value wins over default.
  Missing keys at a layer are filled from the next layer down.
  settings.db is NOT consulted. It is deprecated (see Section 9 — Migration).
```

### 4.2 Workspace `config.json` Schema

Workspace config contains only the keys the user wants to override. Absent keys are inherited from the global config. The schema is a strict subset of `~/.LiteDuck/config.json`.

```json
{
  "$schema": "https://liteduck.dev/schemas/workspace-config.json",
  "version": 1,
  "ai": {
    "default_model": "claude-opus-4-5",
    "temperature": 0.3
  },
  "agents": {
    "max_concurrent": 5,
    "a2a_discovery": false
  },
  "scrum": {
    "default_project_key": "LD"
  }
}
```

Any key present here overrides the matching key in `~/.LiteDuck/config.json`. Any key absent here is read from the global config. No key ever falls back to SQLite.

### 4.3 Rust Types

```rust
// src-tauri/src/config.rs  (new module)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Fully resolved, merged configuration for a workspace session.
/// All fields are populated — either from workspace, global, or built-in default.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    pub appearance: AppearanceConfig,
    pub ai: AiConfig,
    pub terminal: TerminalConfig,
    pub git: GitConfig,
    pub agents: AgentsConfig,
    pub network: NetworkConfig,
    pub scrum: ScrumConfig,
    pub telemetry: TelemetryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScrumConfig {
    pub default_project_key: Option<String>,
}

/// Partial config read from a single layer (workspace or global).
/// Fields absent in the JSON file are `None` and are filled from the next layer.
#[derive(Debug, Clone, Deserialize, Default)]
struct PartialConfig {
    version: Option<u32>,
    appearance: Option<serde_json::Value>,
    ai: Option<serde_json::Value>,
    terminal: Option<serde_json::Value>,
    git: Option<serde_json::Value>,
    agents: Option<serde_json::Value>,
    network: Option<serde_json::Value>,
    scrum: Option<serde_json::Value>,
    telemetry: Option<serde_json::Value>,
}

fn home_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".LiteDuck")
        .join("config.json")
}

fn workspace_config_path(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".LiteDuck").join("config.json")
}

/// Read and merge config layers. Never touches SQLite.
pub fn resolve_config(workspace: Option<&str>) -> Result<Config, String> {
    let global = read_partial(home_config_path()).unwrap_or_default();
    let ws_layer = workspace
        .map(|w| read_partial(workspace_config_path(w)).unwrap_or_default())
        .unwrap_or_default();

    // Merge: workspace layer wins over global layer wins over built-in default.
    let merged = merge_layers(&[ws_layer, global]);
    Ok(apply_defaults(merged))
}

fn read_partial(path: PathBuf) -> Option<PartialConfig> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}
```

### 4.4 Tauri Commands

```rust
/// Return the fully resolved config for the given workspace (or global-only if None).
#[tauri::command]
pub fn config_resolve(workspace: Option<String>) -> Result<Config, String> {
    resolve_config(workspace.as_deref())
}

/// Write a partial config to the workspace layer.
/// Only the provided keys are written — other keys in the file are preserved.
#[tauri::command]
pub fn config_write_workspace(workspace: String, patch: serde_json::Value) -> Result<(), String> {
    let path = workspace_config_path(&workspace);
    let existing = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or(serde_json::json!({"version": 1}));
    let merged = json_merge(existing, patch);
    let text = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Write a partial config to the global layer.
#[tauri::command]
pub fn config_write_global(patch: serde_json::Value) -> Result<(), String> {
    let path = home_config_path();
    let existing = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or(serde_json::json!({"version": 1}));
    let merged = json_merge(existing, patch);
    let text = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}
```

### 4.5 Frontend Hook

```typescript
// src/hooks/useConfig.ts

import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import useSWR from "swr";

export interface Config {
  version: number;
  appearance: AppearanceConfig;
  ai: AiConfig;
  agents: AgentsConfig;
  scrum: ScrumConfig;
  // ...
}

export function useConfig() {
  const { workspace } = useWorkspace();
  return useSWR<Config>(
    ["config", workspace],
    () => invoke<Config>("config_resolve", { workspace }),
    { revalidateOnFocus: false }
  );
}

export async function patchWorkspaceConfig(
  workspace: string,
  patch: Partial<Config>
): Promise<void> {
  await invoke("config_write_workspace", { workspace, patch });
}
```

---

## 5. Scrum — Markdown Primary, SQLite Index (LD-38)

### 5.1 Current Problem

`scrum.rs` calls `crate::db::open()` — a global SQLite connection. The `workspace_directory` field on projects is metadata, not a read-path boundary. All projects from all workspaces appear in every workspace session.

### 5.2 Target Architecture

```
READ path:
  scrum_list_stories(workspace) →
    1. Read <workspace>/.LiteDuck/scrum/projects/<key>/stories/*.md
    2. Parse YAML frontmatter
    3. [optional] check scrum.db index for fast lookups — rebuild index if stale
    → Return Story[]

WRITE path:
  scrum_create_story(workspace, story) →
    1. Serialize to markdown file: <workspace>/.LiteDuck/scrum/projects/<key>/stories/<KEY-N>.md
    2. Upsert row in scrum.db (index entry only)
    → Return Story

INDEX REBUILD:
  scrum_rebuild_index(workspace) →
    1. Scan all markdown files under <workspace>/.LiteDuck/scrum/
    2. Parse frontmatter
    3. Truncate and repopulate scrum.db
    → Called on workspace open if scrum.db is absent or stale
```

### 5.3 Markdown File Format

**Project: `.LiteDuck/scrum/projects/LD/project.md`**

```markdown
---
key: "LD"
name: "LiteDuck"
description: "AI Coding workflow desktop app"
status: "active"
created: "2026-04-01T00:00:00Z"
updated: "2026-04-09T00:00:00Z"
---

## About

Main development project for the LiteDuck Tauri app.
```

**Epic: `.LiteDuck/scrum/projects/LD/epics/EPIC-9.md`**

```markdown
---
id: "EPIC-9"
project: "LD"
title: "Workspace-Scoped Data Isolation"
status: "in-progress"
priority: "high"
labels: ["architecture", "data"]
created: "2026-04-09T00:00:00Z"
updated: "2026-04-09T00:00:00Z"
---

## Description

Make the workspace the atomic unit of data isolation...

## Acceptance Criteria

- [ ] All scrum data reads from workspace markdown files
- [ ] scrum.db is rebuildable from files
- [ ] Switching workspace changes all visible scrum data
```

**Story: `.LiteDuck/scrum/projects/LD/stories/LD-37.md`**

```markdown
---
id: "LD-37"
project: "LD"
epic: "EPIC-9"
sprint: "sprint-3"
title: ".LiteDuck/ directory init"
status: "in-progress"
type: "story"
points: 3
assignee: "council-senior-dev"
labels: ["backend", "storage"]
created: "2026-04-09T00:00:00Z"
updated: "2026-04-09T00:00:00Z"
---

## Description

Initialize the `.LiteDuck/` directory structure when a workspace is opened.

## Tasks

- [ ] T1: Add `LITEDUCK_DIRS` constant to `workspace.rs`
- [ ] T2: Create default files (`config.json`, `mcp/servers.json`) if absent
- [ ] T3: Update `workspace_init` Tauri command
- [ ] T4: Frontend calls `workspace_init` on workspace switch
```

### 5.4 SQLite Index Schema (`scrum.db`)

The index mirrors frontmatter. It is never the authoritative copy — only used to answer queries faster than scanning all markdown files.

```sql
-- <workspace>/.LiteDuck/scrum/scrum.db

CREATE TABLE IF NOT EXISTS scrum_index_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Stores last_indexed_at, schema_version

CREATE TABLE IF NOT EXISTS projects (
    key         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    updated_at  TEXT NOT NULL,
    file_path   TEXT NOT NULL   -- absolute path to project.md
);

CREATE TABLE IF NOT EXISTS epics (
    id          TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL,
    priority    TEXT,
    updated_at  TEXT NOT NULL,
    file_path   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sprints (
    id          TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'planning',
    started_at  TEXT,
    closed_at   TEXT,
    file_path   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
    id          TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    epic_id     TEXT,
    sprint_id   TEXT,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'story',
    points      INTEGER,
    assignee    TEXT,
    updated_at  TEXT NOT NULL,
    file_path   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_sprint   ON stories(sprint_id);
CREATE INDEX IF NOT EXISTS idx_stories_epic     ON stories(epic_id);
CREATE INDEX IF NOT EXISTS idx_stories_status   ON stories(status);
CREATE INDEX IF NOT EXISTS idx_epics_project    ON epics(project_key);
```

### 5.5 Rust API Changes

```rust
// src-tauri/src/scrum.rs  (revised command signatures)

/// All scrum commands receive `workspace` as an explicit parameter.
/// They read from markdown files (via scrum_md::*) and update the SQLite index as a side-effect.

#[tauri::command]
pub fn project_list(workspace: String) -> Result<Vec<Project>, String> {
    scrum_md::project_list(&workspace)
}

#[tauri::command]
pub fn project_create(workspace: String, input: NewProject) -> Result<Project, String> {
    scrum_md::project_create(&workspace, input)
}

#[tauri::command]
pub fn story_list(workspace: String, project_key: String) -> Result<Vec<Story>, String> {
    scrum_md::story_list(&workspace, &project_key)
}

#[tauri::command]
pub fn story_create(workspace: String, input: NewStory) -> Result<Story, String> {
    scrum_md::story_create(&workspace, input)
}

#[tauri::command]
pub fn story_update_status(workspace: String, id: String, status: String) -> Result<Story, String> {
    scrum_md::story_update_status(&workspace, &id, &status)
}

#[tauri::command]
pub fn get_sprint_board(workspace: String, sprint_id: String) -> Result<SprintBoard, String> {
    scrum_md::get_sprint_board(&workspace, &sprint_id)
}

#[tauri::command]
pub fn get_kanban_view(workspace: String, project_key: String) -> Result<KanbanBoard, String> {
    scrum_md::get_kanban_view(&workspace, &project_key)
}

/// Rebuild the scrum.db index from the workspace markdown files.
/// Called on workspace open when the index is absent or the workspace schema version changed.
#[tauri::command]
pub fn scrum_rebuild_index(workspace: String) -> Result<u32, String> {
    scrum_md::rebuild_index(&workspace)
    // Returns count of indexed items.
}
```

### 5.6 `scrum_md` Internal Signature Changes

The functions in `liteduck_core::scrum` (re-exported via `scrum_md.rs`) currently accept `&rusqlite::Connection`. After LD-38 they accept `&str` (workspace path) and manage their own file I/O plus index side-effects internally.

```rust
// Old: pub fn story_list(conn: &Connection, filter: Option<&str>) -> Result<Vec<Story>, String>
// New: pub fn story_list(workspace: &str, project_key: &str) -> Result<Vec<Story>, String>

// Old: pub fn story_create(conn: &Connection, input: NewStory) -> Result<Story, String>
// New: pub fn story_create(workspace: &str, input: NewStory) -> Result<Story, String>
```

The `Connection` import in `scrum_md.rs` is removed entirely after this change. `scrum.db` is opened internally within `liteduck_core::scrum` using a path derived from `workspace`.

---

## 6. Automations — JSON Definitions, SQLite Run Log (LD-39)

### 6.1 Current Problem

`automations.db` stores automation definitions as SQLite rows. They are global — no workspace column exists. When a workspace opens, all automations from all contexts appear.

### 6.2 Target Architecture

Automation definitions are JSON files. `runs.db` logs execution history. Definitions are never stored in SQLite.

```
READ automations for a workspace:
  1. Read <workspace>/.LiteDuck/automations/*.json   (workspace layer)
  2. Read ~/.LiteDuck/automations/*.json              (global layer)
  3. Merge: workspace automations appear first; global automations fill the rest.
     If a slug appears in both layers, the workspace file wins.

WRITE automation (create/edit):
  → Write to <workspace>/.LiteDuck/automations/<slug>.json  (workspace scope)
  or
  → Write to ~/.LiteDuck/automations/<slug>.json            (global scope)

EXECUTE automation:
  → Read definition from JSON file
  → Append run record to <workspace>/.LiteDuck/automations/runs.db
```

### 6.3 JSON File Format

**`<workspace>/.LiteDuck/automations/on-pr-open.json`**

```json
{
  "version": 1,
  "slug": "on-pr-open",
  "name": "PR Opened — Notify Council",
  "description": "When a PR is opened, notify the SCRUM council agent to begin review.",
  "scope": "workspace",
  "enabled": true,
  "trigger": {
    "type": "github_event",
    "config": {
      "event": "pull_request",
      "action": "opened",
      "repo": "${workspace.git.remote}"
    }
  },
  "action": {
    "type": "agent_message",
    "config": {
      "agent": "council-tech-lead",
      "message": "PR #{{pr.number}} opened: {{pr.title}}. Please review for architectural concerns."
    }
  },
  "created_at": "2026-04-09T10:00:00Z",
  "updated_at": "2026-04-09T10:00:00Z"
}
```

**`~/.LiteDuck/automations/daily-standup.json`**

```json
{
  "version": 1,
  "slug": "daily-standup",
  "name": "Daily Standup Reminder",
  "description": "Remind the council to prepare standup notes every morning.",
  "scope": "global",
  "enabled": true,
  "trigger": {
    "type": "schedule",
    "config": { "cron": "0 9 * * 1-5", "timezone": "Asia/Bangkok" }
  },
  "action": {
    "type": "agent_message",
    "config": {
      "agent": "council-po",
      "message": "Standup time. Please summarize yesterday's progress and today's plan."
    }
  },
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-09T10:00:00Z"
}
```

### 6.4 Rust Types

```rust
// src-tauri/src/automations.rs  (rewritten)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationDef {
    pub version: u32,
    pub slug: String,
    pub name: String,
    pub description: String,
    /// "workspace" | "global"
    pub scope: String,
    pub enabled: bool,
    pub trigger: AutomationTrigger,
    pub action: AutomationAction,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationTrigger {
    /// "github_event" | "schedule" | "file_change" | "agent_event" | "manual"
    pub r#type: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationAction {
    /// "agent_message" | "run_command" | "webhook" | "open_file"
    pub r#type: String,
    pub config: serde_json::Value,
}

/// A single run record written to runs.db (never to the JSON definition file).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRun {
    pub id: i64,
    pub automation_slug: String,
    pub status: String,       // "running" | "success" | "failed" | "skipped"
    pub output: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

fn ws_automations_dir(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".LiteDuck").join("automations")
}

fn global_automations_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".LiteDuck").join("automations")
}

fn runs_db_path(workspace: &str) -> PathBuf {
    ws_automations_dir(workspace).join("runs.db")
}

/// Read all automation definitions visible in a workspace.
/// Workspace-scoped files shadow global files with the same slug.
pub fn list_automations(workspace: &str) -> Result<Vec<AutomationDef>, String> {
    let mut map: IndexMap<String, AutomationDef> = IndexMap::new();

    // Global layer first (lower priority)
    for def in read_json_dir(global_automations_dir())? {
        map.entry(def.slug.clone()).or_insert(def);
    }
    // Workspace layer second (wins on slug collision)
    for def in read_json_dir(ws_automations_dir(workspace))? {
        map.insert(def.slug.clone(), def);
    }

    Ok(map.into_values().collect())
}
```

### 6.5 Tauri Commands

```rust
#[tauri::command]
pub fn automation_list(workspace: String) -> Result<Vec<AutomationDef>, String> {
    list_automations(&workspace)
}

#[tauri::command]
pub fn automation_create(
    workspace: String,
    def: AutomationDef,
    scope: String, // "workspace" | "global"
) -> Result<AutomationDef, String> {
    let dir = if scope == "global" {
        global_automations_dir()
    } else {
        ws_automations_dir(&workspace)
    };
    write_automation_json(&dir, def)
}

#[tauri::command]
pub fn automation_delete(workspace: String, slug: String, scope: String) -> Result<(), String> {
    let dir = if scope == "global" {
        global_automations_dir()
    } else {
        ws_automations_dir(&workspace)
    };
    let path = dir.join(format!("{slug}.json"));
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_run_history(
    workspace: String,
    slug: String,
    limit: u32,
) -> Result<Vec<AutomationRun>, String> {
    // Reads from runs.db — the ONLY SQLite call in the automations module.
    query_run_history(&runs_db_path(&workspace), &slug, limit)
}
```

### 6.6 `runs.db` Schema

```sql
-- <workspace>/.LiteDuck/automations/runs.db

CREATE TABLE IF NOT EXISTS automation_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    automation_slug TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'running',
    output          TEXT,
    started_at      TEXT    NOT NULL,
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_slug       ON automation_runs(automation_slug);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON automation_runs(started_at);
```

---

## 7. AI Chat — Markdown Message Logs, SQLite Session Index (LD-40)

### 7.1 Scope Clarification

`chat_db.rs` stores LAN peer-to-peer messages. That is separate from AI assistant chat (the OpenClaw gateway sessions managed by `chat.rs` and `openclaw.rs`). Both are covered here with the same pattern.

### 7.2 AI Chat Sessions

Each conversation with the AI assistant is one markdown file. The SQLite index tracks session metadata for fast listing and search without parsing every file.

**`<workspace>/.LiteDuck/chat/sessions/2026-04-09-ld-37-planning.md`**

```markdown
---
id: "sess_01HX2B3C4D5E6F7G8H9I0J1K2L"
workspace: "/Users/lps/BemindLabs/build-on-openclaw/app-liteduck"
title: "LD-37 Planning Discussion"
model: "claude-sonnet-4-6"
started_at: "2026-04-09T10:00:00Z"
updated_at: "2026-04-09T10:45:00Z"
message_count: 12
tags: ["scrum", "planning", "LD-37"]
---

<!-- role: user | time: 2026-04-09T10:00:00Z -->
Let's plan the workspace init story. What directories do we need?

<!-- role: assistant | time: 2026-04-09T10:00:05Z | model: claude-sonnet-4-6 -->
Based on ADR-001 and the `.LiteDuck/` layout, we need the following directories...

<!-- role: user | time: 2026-04-09T10:02:00Z -->
Should scrum.db live inside the scrum/ subdirectory?
```

### 7.3 SQLite Session Index Schema (`sessions.db`)

```sql
-- <workspace>/.LiteDuck/chat/sessions.db

CREATE TABLE IF NOT EXISTS chat_sessions (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    model        TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    file_path    TEXT NOT NULL,    -- absolute path to the .md file
    tags         TEXT             -- JSON array
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_model   ON chat_sessions(model);
```

The index is rebuilt from markdown files if `sessions.db` is absent or `file_path` references a file that no longer exists.

### 7.4 Rust Types

```rust
// src-tauri/src/chat.rs  (extended)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub workspace: String,
    pub title: String,
    pub model: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: u32,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,      // "user" | "assistant" | "system"
    pub content: String,
    pub timestamp: String,
    pub model: Option<String>,
}

fn sessions_dir(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".LiteDuck").join("chat").join("sessions")
}

fn sessions_db_path(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".LiteDuck").join("chat").join("sessions.db")
}
```

### 7.5 Tauri Commands

```rust
/// List all chat sessions for the given workspace.
/// Reads from sessions.db index. Rebuilds index if stale.
#[tauri::command]
pub fn chat_list_sessions(workspace: String) -> Result<Vec<ChatSession>, String> {
    ensure_sessions_index(&workspace)?;
    query_sessions_index(&sessions_db_path(&workspace))
}

/// Start a new chat session. Creates the markdown file and index entry.
#[tauri::command]
pub async fn chat_start_session(
    workspace: String,
    title: String,
    model: String,
    tags: Vec<String>,
    state: tauri::State<'_, ChatCancelState>,
) -> Result<ChatSession, String> {
    let session = ChatSession {
        id: new_session_id(),
        workspace: workspace.clone(),
        title,
        model,
        started_at: now_utc(),
        updated_at: now_utc(),
        message_count: 0,
        tags,
    };
    write_session_file(&workspace, &session, &[])?;
    upsert_session_index(&sessions_db_path(&workspace), &session)?;
    Ok(session)
}

/// Append a message to a session. Updates the markdown file and index entry.
#[tauri::command]
pub fn chat_append_message(
    workspace: String,
    session_id: String,
    message: ChatMessage,
) -> Result<(), String> {
    let file_path = sessions_dir(&workspace).join(format!("{session_id}.md"));
    append_message_to_file(&file_path, &message)?;
    update_session_index(&sessions_db_path(&workspace), &session_id, &message.timestamp)?;
    Ok(())
}

/// Load all messages from a session's markdown file.
#[tauri::command]
pub fn chat_load_session(workspace: String, session_id: String) -> Result<Vec<ChatMessage>, String> {
    let file_path = sessions_dir(&workspace).join(format!("{session_id}.md"));
    parse_messages_from_file(&file_path)
}

/// Delete a session: removes the markdown file and index entry.
#[tauri::command]
pub fn chat_delete_session(workspace: String, session_id: String) -> Result<(), String> {
    let file_path = sessions_dir(&workspace).join(format!("{session_id}.md"));
    std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    delete_session_index_entry(&sessions_db_path(&workspace), &session_id)
}
```

### 7.6 LAN Chat (`chat_db.rs`)

LAN chat already stores messages per-workspace at `<workspace>/.chat/messages.db`. This is moved to `.LiteDuck/chat/lan.db` for consistency. The schema and logic in `chat_db.rs` are unchanged — only the path changes.

```rust
// Old: <workspace>/.chat/messages.db
// New: <workspace>/.LiteDuck/chat/lan.db

pub fn chat_db_path(workspace: &str) -> String {
    Path::new(workspace)
        .join(".LiteDuck")
        .join("chat")
        .join("lan.db")
        .to_string_lossy()
        .to_string()
}
```

---

## 8. MCP — Workspace JSON Overrides Global (LD-41)

### 8.1 Current Problem

`mcp.db` stores all MCP server configs in one table with an optional `workspace` column. The read path in `mcp_list_server_configs` applies a `WHERE workspace IS NULL OR workspace = ?` filter — but this is a SQLite read, not a file read, which violates ADR-001 P2.

### 8.2 Target Architecture

```
READ mcp servers for a workspace:
  1. Read ~/.LiteDuck/mcp/servers.json          (global definitions)
  2. Read <workspace>/.LiteDuck/mcp/servers.json (workspace overrides)
  3. Merge: union by slug; workspace entries win on conflict.
  → Active MCP connections managed in McpState (in-memory, not persisted)

WRITE mcp server config:
  → Write to workspace or global servers.json depending on scope

mcp.db is fully retired. All persistence moves to JSON files.
```

### 8.3 `servers.json` Format

**`~/.LiteDuck/mcp/servers.json`** (global)

```json
{
  "version": 1,
  "servers": [
    {
      "slug": "filesystem",
      "name": "Filesystem MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-filesystem", "/Users/lps"],
      "enabled": true
    },
    {
      "slug": "github",
      "name": "GitHub MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": { "GITHUB_TOKEN": "${keychain:github_token}" },
      "enabled": true
    }
  ]
}
```

**`<workspace>/.LiteDuck/mcp/servers.json`** (workspace override)

```json
{
  "version": 1,
  "servers": [
    {
      "slug": "filesystem",
      "name": "Filesystem MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-filesystem", "/Users/lps/BemindLabs/build-on-openclaw/app-liteduck"],
      "enabled": true
    },
    {
      "slug": "jira",
      "name": "Jira MCP",
      "transport": "http",
      "url": "https://api.atlassian.com/mcp",
      "api_key": "${keychain:jira_api_key}",
      "enabled": true
    }
  ]
}
```

In the merged result: `filesystem` uses the workspace path; `github` comes from global; `jira` comes from workspace only.

### 8.4 Rust Types

```rust
// src-tauri/src/mcp.rs  (revised)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub slug: String,
    pub name: String,
    pub transport: String,            // "stdio" | "http"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub api_key: Option<String>,
    pub enabled: bool,
    // Removed: id (was SQLite rowid), workspace (now determined by file location)
}

fn global_mcp_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".LiteDuck").join("mcp").join("servers.json")
}

fn workspace_mcp_path(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".LiteDuck").join("mcp").join("servers.json")
}

pub fn list_mcp_configs(workspace: &str) -> Result<Vec<McpServerConfig>, String> {
    let global = read_servers_json(global_mcp_path()).unwrap_or_default();
    let ws = read_servers_json(workspace_mcp_path(workspace)).unwrap_or_default();

    let mut map: IndexMap<String, McpServerConfig> = IndexMap::new();
    for s in global { map.entry(s.slug.clone()).or_insert(s); }
    for s in ws     { map.insert(s.slug.clone(), s); }  // workspace wins

    Ok(map.into_values().collect())
}
```

### 8.5 Tauri Commands

```rust
#[tauri::command]
pub fn mcp_list_server_configs(workspace: String) -> Result<Vec<McpServerConfig>, String> {
    list_mcp_configs(&workspace)
}

#[tauri::command]
pub fn mcp_save_server_config(
    workspace: String,
    config: McpServerConfig,
    scope: String,  // "workspace" | "global"
) -> Result<(), String> {
    let path = if scope == "global" { global_mcp_path() } else { workspace_mcp_path(&workspace) };
    upsert_server_in_json_file(path, config)
}

#[tauri::command]
pub fn mcp_delete_server_config(
    workspace: String,
    slug: String,
    scope: String,
) -> Result<(), String> {
    let path = if scope == "global" { global_mcp_path() } else { workspace_mcp_path(&workspace) };
    remove_server_from_json_file(path, &slug)
}
```

---

## 9. Workspace Switching

### 9.1 What Changes on Switch

When the user opens a different workspace, the entire data context changes. No data from the previous workspace leaks into the new session.

```
On workspace switch (WorkspaceContext update):
  1. Stop active MCP connections for old workspace (McpState cleanup)
  2. Close SQLite connections for old workspace (scrum.db, sessions.db, runs.db, lan.db)
  3. Update WorkspaceContext to new path
  4. Call workspace_init(new_workspace) → creates .LiteDuck/ if absent
  5. Call scrum_rebuild_index(new_workspace) → ensure index is current
  6. Call chat_list_sessions(new_workspace) → prefetch session list
  7. Call mcp_list_server_configs(new_workspace) → load MCP servers for new workspace
  8. Emit "workspace:switched" Tauri event → all panels re-query with new workspace
```

### 9.2 Data Visibility Matrix

| Data domain | Old workspace | New workspace |
|-------------|---------------|---------------|
| Scrum board | Hidden | Shows .LiteDuck/scrum/ of new workspace |
| Automations | Hidden | Merges .LiteDuck/automations/ + ~/.LiteDuck/automations/ |
| Chat sessions | Hidden | Shows .LiteDuck/chat/sessions/ of new workspace |
| MCP servers | Disconnected | Merges .LiteDuck/mcp/ + ~/.LiteDuck/mcp/ |
| Config | Cleared | Merges .LiteDuck/config.json + ~/.LiteDuck/config.json |
| Agent profiles | Hidden | Shows workspace/agents/ + ~/.LiteDuck/agents/ |
| Terminal PTY | Preserved | PTY sessions are never unmounted (by design) |

### 9.3 Frontend WorkspaceContext Change

```typescript
// src/contexts/WorkspaceContext.tsx  (updated)

interface WorkspaceContextValue {
  workspace: string | null;
  switchWorkspace: (path: string) => Promise<void>;
}

async function switchWorkspace(path: string): Promise<void> {
  // 1. Init .LiteDuck/ if needed
  await invoke("workspace_init", { workspace: path });

  // 2. Rebuild scrum index
  await invoke("scrum_rebuild_index", { workspace: path });

  // 3. Update context (triggers re-renders in all workspace-aware hooks)
  setWorkspace(path);

  // 4. Register in workspaces.json
  await invoke("workspace_register", { path });
}
```

### 9.4 UI — Workspace Switcher

```
┌─────────────────────────────────────────────────────────────┐
│ LiteDuck                                     [⌘K] [Settings]│
├────────┬────────────────────────────────────────────────────┤
│        │ ┌────────────────────────────────────────────────┐ │
│  NAV   │ │ Switch Workspace                               │ │
│        │ │                                                │ │
│ Home   │ │  Pinned                                        │ │
│ Scrum  │ │  ● LiteDuck        /BemindLabs/app-liteduck   │ │
│ Agents │ │    OpenClaw Core   /BemindLabs/openclaw        │ │
│ Chat   │ │                                                │ │
│ Auto.  │ │  Recent                                        │ │
│ MCP    │ │    app-self-growth /BemindLabs/app-self-growth │ │
│        │ │    app-accounting  /BemindLabs/app-accounting  │ │
│        │ │                                                │ │
│        │ │  [+ Open Folder]    [+ New Workspace]          │ │
│        │ └────────────────────────────────────────────────┘ │
└────────┴────────────────────────────────────────────────────┘
```

All panels reload automatically when `workspace` in `WorkspaceContext` changes. There is no manual "refresh" action.

---

## 10. Migration (LD-36 Dependency)

### 10.1 Migration Phases

Migration runs once per global database. Each database is exported to files, then archived. The app never reads from the archived databases again.

```
Phase 1 — Detected on first launch after upgrade:
  Check: ~/.LiteDuck/config.json exists?
    No  → Run migration wizard for settings.db → config.json
    Yes → Skip

Phase 2 — On workspace open:
  Check: <workspace>/.LiteDuck/scrum/ populated?
    No, but scrum.db has rows for this workspace → migrate those rows to markdown files
    Yes → Skip

Phase 3 — On workspace open:
  Check: <workspace>/.LiteDuck/automations/*.json exists?
    No, but automations.db has rows → export to JSON files
    Yes → Skip

Phase 4 — After all workspaces migrated:
  Archive: mv settings.db settings.db.archived
  Archive: mv automations.db automations.db.archived
  Archive: mv mcp.db mcp.db.archived
  App never reads .archived files.
```

### 10.2 `settings.db` → `config.json`

```rust
#[tauri::command]
pub fn migrate_settings_db_to_json() -> Result<MigrationReport, String> {
    let conn = db::open().map_err(|e| e.to_string())?;
    let rows = db::get_all_settings(&conn).map_err(|e| e.to_string())?;

    let mut config_patch = serde_json::json!({ "version": 1 });

    for (key, value) in rows {
        // Map known settings.db keys to config.json paths.
        // e.g., "gateway_url" → config.ai.gateway_url
        if let Some(path) = SETTINGS_KEY_MAP.get(key.as_str()) {
            json_set_nested(&mut config_patch, path, value);
        }
        // Unknown keys are skipped (not migrated — they are likely stale).
    }

    let global_config_path = home_config_path();
    if !global_config_path.exists() {
        let text = serde_json::to_string_pretty(&config_patch).map_err(|e| e.to_string())?;
        std::fs::write(&global_config_path, text).map_err(|e| e.to_string())?;
    }

    // Archive the database.
    let db_path = db::db_path();
    let archive_path = db_path.with_extension("db.archived");
    std::fs::rename(&db_path, &archive_path).map_err(|e| e.to_string())?;

    Ok(MigrationReport { migrated: rows.len(), archived: db_path.display().to_string() })
}
```

### 10.3 `mcp.db` → JSON Files

```rust
pub fn migrate_mcp_db_to_json(mcp_db_path: &str) -> Result<MigrationReport, String> {
    let conn = Connection::open(mcp_db_path).map_err(|e| e.to_string())?;
    let configs = query_all_mcp_configs(&conn)?;

    let mut global_servers: Vec<McpServerConfig> = Vec::new();
    let mut ws_servers: HashMap<String, Vec<McpServerConfig>> = HashMap::new();

    for cfg in configs {
        match &cfg.workspace {
            None => global_servers.push(cfg.into()),
            Some(ws) => ws_servers.entry(ws.clone()).or_default().push(cfg.into()),
        }
    }

    // Write global servers
    write_servers_json(global_mcp_path(), global_servers)?;

    // Write workspace-scoped servers
    for (ws, servers) in ws_servers {
        write_servers_json(workspace_mcp_path(&ws), servers)?;
    }

    // Archive mcp.db
    let archive = PathBuf::from(mcp_db_path).with_extension("db.archived");
    std::fs::rename(mcp_db_path, &archive).map_err(|e| e.to_string())?;

    Ok(MigrationReport { migrated: configs.len(), archived: archive.display().to_string() })
}
```

### 10.4 Migration Tauri Commands

```rust
#[tauri::command]
pub fn migration_check() -> Result<MigrationStatus, String> {
    Ok(MigrationStatus {
        needs_settings_migration: db::db_path().exists() && !home_config_path().exists(),
        needs_mcp_migration: mcp_db_path().exists(),
        needs_automations_migration: automations_db_path().exists(),
    })
}

#[tauri::command]
pub fn migration_run_all() -> Result<Vec<MigrationReport>, String> {
    let mut reports = Vec::new();
    let status = migration_check()?;
    if status.needs_settings_migration {
        reports.push(migrate_settings_db_to_json()?);
    }
    if status.needs_mcp_migration {
        reports.push(migrate_mcp_db_to_json(&mcp_db_path().to_string_lossy())?);
    }
    if status.needs_automations_migration {
        reports.push(migrate_automations_db_to_json(&automations_db_path().to_string_lossy())?);
    }
    Ok(reports)
}
```

---

## 11. AI Agent Integration

### 11.1 How Agents Access Workspace Data

AI agents in LiteDuck are given the workspace path when invoked. They read and write workspace data through the same Tauri commands as the frontend — no privileged bypass.

```
Agent invocation context (passed via OpenClaw gateway):
  workspace: "/Users/lps/BemindLabs/build-on-openclaw/app-liteduck"
  agent_slug: "council-tech-lead"
  session_id: "sess_01HX2B3C4D5E6F7G8H9I0J1K2L"
```

Agents can:
- Read and write scrum stories (`story_update_status`, `story_create`)
- Read and write agent memory (`agent_memory.rs` — already workspace-aware)
- Read automation definitions (`automation_list`)
- Append to chat sessions (`chat_append_message`)
- Read config (`config_resolve`)

Agents cannot:
- Access another workspace's files
- Write to global MCP or automation config without an explicit `scope: "global"` parameter (which requires human approval in the impact gate)

### 11.2 Memory Layer Integration

Agent memory already uses a file-based hierarchy. With EPIC-9, the workspace memory layer maps directly to `.LiteDuck/.agents/memory/`:

```
Memory search budget (from ADR-001):
  Agent memory    (30%): <workspace>/agents/<slug>/memory/*.md
  Workspace memory(25%): <workspace>/.LiteDuck/.agents/memory/*.md
  Group memory    (20%): ~/.LiteDuck/groups/<group>/memory/*.md
  Global memory   (15%): ~/.LiteDuck/memory/*.md
  Shared memory   (10%): (future — cross-device sync)
```

The workspace memory layer (`.LiteDuck/.agents/memory/`) is where agents store learnings scoped to the project — commit conventions, team decisions, architecture notes — without polluting global memory.

### 11.3 Agent Write Path for Workspace Data

When an agent writes a scrum story or creates an automation, the write goes to a markdown or JSON file in `.LiteDuck/`. The agent never writes to SQLite directly.

```
Agent: "I'll create story LD-42 for the migration wizard."
  → Tauri IPC: story_create(workspace, NewStory { id: "LD-42", ... })
  → Rust: writes <workspace>/.LiteDuck/scrum/projects/LD/stories/LD-42.md
  → Rust: upserts LD-42 into scrum.db index
  → Frontend: receives updated story list via Tauri event
  → Human sees new story on the Kanban board
```

---

## 12. Story-by-Story Implementation Plan

### LD-37: `.LiteDuck/` Directory Init

**Goal:** `workspace_init` creates the full `.LiteDuck/` skeleton.

| Task | File | Change |
|------|------|--------|
| T1 | `workspace.rs` | Add `LITEDUCK_DIRS` constant with all subdirectories |
| T2 | `workspace.rs` | Add `LITEDUCK_DEFAULT_FILES` for `config.json` and `mcp/servers.json` |
| T3 | `workspace.rs` | Update `workspace_init` to create dirs and default files |
| T4 | `WorkspaceContext.tsx` | Call `workspace_init` on every workspace switch (not just first open) |
| T5 | `workspace.rs` | Add `workspace_check_liteduck` command — returns which dirs/files are present |

**Acceptance:** Opening any workspace creates `.LiteDuck/` with all subdirectories and default files. Re-opening does not overwrite existing files.

---

### LD-38: Workspace-Scoped Scrum

**Goal:** Scrum reads from markdown files under `.LiteDuck/scrum/`. SQLite is an index only.

| Task | File | Change |
|------|------|--------|
| T1 | `liteduck_core::scrum` | Change function signatures from `(&Connection, ...)` to `(&str workspace, ...)` |
| T2 | `liteduck_core::scrum` | Implement file read/write for all CRUD operations |
| T3 | `liteduck_core::scrum` | Implement `rebuild_index(workspace)` that scans markdown → populates scrum.db |
| T4 | `scrum_md.rs` | Remove `pub use rusqlite::Connection` — no longer part of the public API |
| T5 | `scrum.rs` | Update all command signatures to accept `workspace: String` |
| T6 | `scrum.rs` | Remove `crate::db::open()` calls — scrum no longer uses global db |
| T7 | `ScrumPage.tsx` | Pass `workspace` from `useWorkspace()` to all scrum invoke calls |
| T8 | `WorkspaceContext.tsx` | Call `scrum_rebuild_index` on workspace switch |

**Acceptance:** Two workspaces with different scrum projects open sequentially. Switching between them shows the correct project's stories on the board.

---

### LD-39: Workspace-Scoped Automations

**Goal:** Automation definitions are JSON files. `runs.db` is run history only.

| Task | File | Change |
|------|------|--------|
| T1 | `automations.rs` | Replace `Automation` struct with `AutomationDef` (JSON-serializable, no SQL fields) |
| T2 | `automations.rs` | Implement `list_automations(workspace)` — reads workspace + global JSON dirs |
| T3 | `automations.rs` | Implement `write_automation_json` / `remove_server_from_json_file` |
| T4 | `automations.rs` | Implement `query_run_history` against `runs.db` |
| T5 | `automations.rs` | Implement `ensure_tables` for `runs.db` schema (run log only) |
| T6 | Tauri commands | Update `automation_list`, `automation_create`, `automation_delete`, `automation_run_history` |
| T7 | `AutomationsPage.tsx` | Pass `workspace` to all automation invoke calls |
| T8 | Frontend | Add scope selector (workspace / global) to automation create form |

**Acceptance:** Creating an automation in workspace A does not appear in workspace B. Global automations appear in all workspaces. Run history is per-workspace.

---

### LD-40: Workspace-Scoped AI Chat

**Goal:** Chat sessions stored as markdown files. `sessions.db` is a list index only.

| Task | File | Change |
|------|------|--------|
| T1 | `chat.rs` | Add `ChatSession` and `ChatMessage` Rust types |
| T2 | `chat.rs` | Implement `write_session_file` — creates `.md` with YAML frontmatter |
| T3 | `chat.rs` | Implement `append_message_to_file` — appends comment-delimited message block |
| T4 | `chat.rs` | Implement `parse_messages_from_file` — parses the `.md` format |
| T5 | `chat.rs` | Implement `sessions.db` index helpers: `upsert_session_index`, `delete_session_index_entry` |
| T6 | Tauri commands | Add `chat_list_sessions`, `chat_start_session`, `chat_append_message`, `chat_load_session`, `chat_delete_session` |
| T7 | `chat_db.rs` | Update LAN chat db path to `.LiteDuck/chat/lan.db` |
| T8 | `ChatPage.tsx` | Pass `workspace` to all chat invoke calls; read session list from new commands |

**Acceptance:** Chat sessions created in workspace A are not visible in workspace B. Session history is human-readable markdown. Deleting `sessions.db` and reopening rebuilds the index from markdown files.

---

### LD-41: Workspace Config Override

**Goal:** `config_resolve(workspace)` reads two JSON files and returns a merged config.

| Task | File | Change |
|------|------|--------|
| T1 | `config.rs` (new) | Define `Config`, `PartialConfig`, `resolve_config`, `merge_layers`, `apply_defaults` |
| T2 | `config.rs` | Implement `config_write_workspace` and `config_write_global` |
| T3 | `lib.rs` | Register `config_resolve`, `config_write_workspace`, `config_write_global` in handler list |
| T4 | `useConfig.ts` (new) | `useConfig()` hook — SWR + `config_resolve` |
| T5 | Frontend | Replace all `getSetting()` / `get_settings()` calls with `useConfig()` |
| T6 | `SettingsPage.tsx` | Add workspace/global toggle; writes to correct layer |
| T7 | Migration | `migration_check()` + `migration_run_all()` Tauri commands |
| T8 | Startup | Run `migration_check()` on app launch; show migration wizard if needed |

**Acceptance:** Setting a model in workspace A config does not change the model in workspace B. Deleting workspace config reverts to global config. `settings.db` is read only during migration, never afterward.

---

## 13. Tauri Command Summary

All commands added or changed by EPIC-9:

| Command | Module | Workspace param | Notes |
|---------|--------|-----------------|-------|
| `workspace_init` | `workspace.rs` | `workspace: String` | Extended to create `.LiteDuck/` dirs |
| `config_resolve` | `config.rs` | `workspace: Option<String>` | New |
| `config_write_workspace` | `config.rs` | `workspace: String` | New |
| `config_write_global` | `config.rs` | — | New |
| `project_list` | `scrum.rs` | `workspace: String` | Signature changed |
| `project_create` | `scrum.rs` | `workspace: String` | Signature changed |
| `story_list` | `scrum.rs` | `workspace: String` | Signature changed |
| `story_create` | `scrum.rs` | `workspace: String` | Signature changed |
| `story_update_status` | `scrum.rs` | `workspace: String` | Signature changed |
| `get_sprint_board` | `scrum.rs` | `workspace: String` | Signature changed |
| `get_kanban_view` | `scrum.rs` | `workspace: String` | Signature changed |
| `scrum_rebuild_index` | `scrum.rs` | `workspace: String` | New |
| `automation_list` | `automations.rs` | `workspace: String` | Rewritten |
| `automation_create` | `automations.rs` | `workspace: String` + `scope` | Rewritten |
| `automation_delete` | `automations.rs` | `workspace: String` + `scope` | Rewritten |
| `automation_run_history` | `automations.rs` | `workspace: String` | Rewritten |
| `chat_list_sessions` | `chat.rs` | `workspace: String` | New |
| `chat_start_session` | `chat.rs` | `workspace: String` | New |
| `chat_append_message` | `chat.rs` | `workspace: String` | New |
| `chat_load_session` | `chat.rs` | `workspace: String` | New |
| `chat_delete_session` | `chat.rs` | `workspace: String` | New |
| `mcp_list_server_configs` | `mcp.rs` | `workspace: String` | Signature changed |
| `mcp_save_server_config` | `mcp.rs` | `workspace: String` + `scope` | Rewritten |
| `mcp_delete_server_config` | `mcp.rs` | `workspace: String` + `scope` | Rewritten |
| `migration_check` | `config.rs` | — | New |
| `migration_run_all` | `config.rs` | — | New |

**Rule:** Every command that reads or writes user data takes `workspace: String` as an explicit parameter. No command infers the workspace from global state. The frontend reads the current workspace from `WorkspaceContext` and passes it on every invoke call.

---

## 14. Testing Strategy

### 14.1 Rust Unit Tests

Each module gets tests that operate on `tempfile::tempdir()` workspaces — no real filesystem involvement, no shared global state.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn workspace_init_creates_liteduck_dirs() {
        let ws = tempdir().unwrap();
        let result = init_liteduck_dirs(ws.path().to_str().unwrap()).unwrap();
        assert!(ws.path().join(".LiteDuck/scrum").exists());
        assert!(ws.path().join(".LiteDuck/automations").exists());
        assert!(ws.path().join(".LiteDuck/chat/sessions").exists());
        assert!(ws.path().join(".LiteDuck/mcp").exists());
        assert_eq!(result.len(), LITEDUCK_DIRS.len());
    }

    #[test]
    fn config_resolve_workspace_overrides_global() {
        let ws = tempdir().unwrap();
        // Write global config with model "claude-sonnet-4-6"
        // Write workspace config with model "claude-opus-4-5"
        // resolve_config(Some(ws)) must return "claude-opus-4-5"
    }

    #[test]
    fn automation_list_workspace_shadows_global() {
        // Create global automation slug="daily-standup"
        // Create workspace automation slug="daily-standup" with different name
        // list_automations(ws) must return the workspace version
    }

    #[test]
    fn scrum_story_isolated_per_workspace() {
        let ws_a = tempdir().unwrap();
        let ws_b = tempdir().unwrap();
        story_create(ws_a.path().to_str().unwrap(), NewStory { id: "LD-1", ... });
        let stories_b = story_list(ws_b.path().to_str().unwrap(), "LD").unwrap();
        assert!(stories_b.is_empty());
    }
}
```

### 14.2 Frontend Tests

`src/test/tauri-mocks.ts` is extended with mocks for all new EPIC-9 commands. Each page test asserts that invoke is called with the correct `workspace` argument.

```typescript
// src/test/tauri-mocks.ts (additions)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd, args) => {
    switch (cmd) {
      case "config_resolve": return Promise.resolve(mockConfig);
      case "automation_list": return Promise.resolve(mockAutomations);
      case "chat_list_sessions": return Promise.resolve(mockSessions);
      // ...
    }
  }),
}));
```

---

## 15. Open Questions

| # | Question | Decision needed by |
|---|----------|--------------------|
| Q1 | Should `scrum.db` live inside `.LiteDuck/scrum/` or at `.LiteDuck/scrum.db`? Current design puts it at `.LiteDuck/scrum/scrum.db`. | LD-38 start |
| Q2 | When an automation in the global layer is disabled in workspace config, how is that represented? A workspace override file with `"enabled": false`? Or a blocklist in `config.json`? | LD-39 start |
| Q3 | Should AI chat sessions be git-committed (in `.LiteDuck/chat/`) or gitignored? Chat files may contain sensitive prompts. | LD-40 start |
| Q4 | `chat_db.rs` (LAN chat) currently lives at `<workspace>/.chat/messages.db`. Moving it to `.LiteDuck/chat/lan.db` is a breaking change for existing LAN chat history. Is a migration needed or can LAN chat history be dropped? | LD-40 start |
| Q5 | Should workspace config support `extends` — pointing to a template config in `~/.LiteDuck/templates/`? | LD-41 design |
