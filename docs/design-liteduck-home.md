# Design: `~/.LiteDuck` — Application Memory Root

> **Status:** Draft
> **Date:** 2026-04-09
> **Scope:** User-level persistent storage for the LiteDuck desktop application

---

## 1. Motivation

LiteDuck currently stores data in two places:

| Layer | Path | Contents |
|-------|------|----------|
| **App-level** | `~/Library/Application Support/com.bemindlabs.liteduck/` (macOS) | `settings.db`, `automations.db`, `mcp.db`, `liteduck.log` |
| **Workspace-level** | `<workspace>/.LiteDuck/` | Scrum data, agent memory, chat history |

This leaves a gap: there is no **user-level** directory that is cross-workspace, human-navigable, and version-controllable. A developer's identity, global preferences, reusable templates, and cross-project agent knowledge have no canonical home.

`~/.LiteDuck` fills this gap — a well-known, user-owned root that:

- Lives at a predictable, memorable path in the user's home directory
- Stores cross-workspace data (global agents, templates, MCP configs)
- Is human-readable (markdown + JSON, no SQLite here)
- Can optionally be synced or version-controlled by the user
- Follows the same philosophy as `~/.ssh`, `~/.config`, `~/.claude`

---

## 2. Directory Structure

```
~/.LiteDuck/
├── config.json                    # Global application config
├── profile.md                     # User identity & preferences
├── workspaces.json                # Workspace registry
│
├── memory/                        # Cross-workspace knowledge graph
│   ├── MEMORY.md                  # Memory index (Obsidian-format)
│   ├── user_*.md                  # User profile memories
│   ├── feedback_*.md              # Behavioral feedback memories
│   ├── project_*.md               # Cross-project knowledge
│   └── reference_*.md             # External resource pointers
│
├── agents/                        # Global agent profiles (available in all workspaces)
│   └── <agent-slug>/
│       ├── profile.md             # Agent definition (YAML frontmatter + markdown)
│       ├── memory/
│       │   ├── MEMORY.md          # Agent-specific memory index
│       │   └── *.md               # Memory entries
│       └── tasks/
│           └── *.md               # Agent task files
│
├── groups.json                    # Workspace group definitions
├── groups/                        # Group-level shared memory & agents
│   └── <group-slug>/
│       ├── memory/
│       │   ├── MEMORY.md          # Group memory index
│       │   └── *.md               # Shared memory notes
│       └── agents/                # Group-level shared agents
│           └── <agent-slug>/
│               ├── profile.md
│               └── memory/
│
├── providers.json                 # LLM provider registry
├── tools.json                     # CLI tool registry & slots
│
├── agents-council/                  # AgentsCouncil configurations
│   ├── pipelines/                 # Custom pipeline definitions
│   ├── presets/                   # Council presets
│   ├── phases/                    # Custom phase blocks
│   ├── prompts/                   # Prompt template overrides
│   ├── voting-rules/              # Custom voting rules
│   ├── gates/                     # Custom quality/security gates
│   └── hooks.json                 # Workflow hooks
│
├── templates/                     # User-customized workspace templates
│   ├── scrum/
│   │   └── project.md             # Default scrum project template
│   ├── agents/
│   │   └── <template-slug>/
│   │       └── profile.md         # Reusable agent profile templates
│   └── workspace/
│       └── CLAUDE.md              # Default CLAUDE.md for new workspaces
│
├── mcp/                           # Global MCP server configurations
│   ├── servers.json               # MCP server registry
│   └── <server-slug>/
│       └── config.json            # Per-server configuration
│
├── automations/                   # Global automation definitions
│   └── <automation-slug>.json     # Reusable automation workflows
│
├── plugins/                       # User-installed extensions
│   └── <plugin-slug>/
│       ├── manifest.json          # Plugin metadata
│       └── ...                    # Plugin files
│
├── cache/                         # Ephemeral cached data (safe to delete)
│   ├── avatars/                   # User/agent avatar cache
│   ├── models/                    # Model metadata cache
│   └── github/                    # GitHub API response cache
│
└── logs/                          # Application logs (rotated)
    ├── liteduck.log               # Current log
    └── liteduck.log.1             # Previous rotation
```

---

## 3. File Specifications

### 3.1 `config.json` — Global Configuration

The single source of truth for app-wide preferences that aren't secrets. Secrets remain in the OS keychain.

```json
{
  "$schema": "https://liteduck.dev/schemas/config.json",
  "version": 1,
  "appearance": {
    "theme": "system",
    "font_family": "JetBrains Mono",
    "font_size": 14,
    "sidebar_position": "left",
    "sidebar_collapsed": false
  },
  "ai": {
    "default_model": "claude-sonnet-4-6",
    "gateway_url": "http://localhost:3000",
    "streaming": true,
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "terminal": {
    "shell": "/bin/zsh",
    "env": {},
    "scrollback": 10000
  },
  "git": {
    "auto_fetch": true,
    "fetch_interval_secs": 300,
    "sign_commits": false
  },
  "agents": {
    "max_concurrent": 3,
    "default_model": "claude-sonnet-4-6",
    "auto_collect_memory": true,
    "a2a_discovery": true,
    "a2a_port": 41000
  },
  "network": {
    "lan_chat_enabled": true,
    "ble_enabled": false,
    "mesh_enabled": false
  },
  "telemetry": {
    "enabled": false,
    "anonymous": true
  }
}
```

### 3.2 `profile.md` — User Identity

Human-readable user profile used by agents for personalization. Not synced to any server — purely local.

```markdown
---
name: "Pituk K"
handle: "lps"
role: "Full-stack Engineer"
timezone: "Asia/Bangkok"
languages:
  - TypeScript
  - Rust
  - Go
  - Python
preferred_tools:
  - claude-code
  - neovim
  - warp
created: "2026-04-09"
updated: "2026-04-09"
---

## About

Senior engineer at Bemind Labs. Building AI-native developer tools.

## Preferences

- Terse communication, no fluff
- Markdown-first for all persistence
- Local-first, privacy-conscious
- Prefer small PRs over large ones
```

### 3.3 `workspaces.json` — Workspace Registry

Index of all known workspaces with metadata. Replaces the SQLite-stored `workspace_history`.

```json
{
  "version": 1,
  "active": "/Users/lps/BemindLabs/build-on-openclaw/app-liteduck",
  "workspaces": [
    {
      "path": "/Users/lps/BemindLabs/build-on-openclaw/app-liteduck",
      "name": "LiteDuck",
      "last_opened": "2026-04-09T10:30:00Z",
      "pinned": true,
      "tags": ["tauri", "rust", "react"]
    },
    {
      "path": "/Users/lps/BemindLabs/build-on-openclaw/openclaw",
      "name": "OpenClaw Core",
      "last_opened": "2026-04-08T15:00:00Z",
      "pinned": true,
      "tags": ["typescript", "platform"]
    }
  ]
}
```

### 3.4 `memory/` — Cross-Workspace Knowledge Graph

Uses the same Obsidian-format memory system already implemented in `agent_memory.rs`, but scoped to the **user level** rather than a single workspace. This is where LiteDuck stores knowledge that spans projects.

Each memory note follows the existing format:

```markdown
---
title: "Bemind Labs mono-repo structure"
type: reference
tags: [architecture, monorepo]
related: [[openclaw-gateway-setup]]
created: "2026-04-09T10:00:00Z"
updated: "2026-04-09T10:00:00Z"
---

The build-on-openclaw repo is a git superproject with 7 submodules...
```

**Memory types** (matching Claude Code's memory taxonomy):

| Type | Purpose | Example |
|------|---------|---------|
| `user` | User role, goals, knowledge | "Senior Rust engineer, new to React" |
| `feedback` | Behavioral corrections & confirmations | "Don't mock databases in integration tests" |
| `project` | Cross-project knowledge | "Mobile release freeze starts 2026-04-10" |
| `reference` | Pointers to external resources | "Pipeline bugs tracked in Linear INGEST project" |

**`MEMORY.md`** — Index file (loaded into agent context):

```markdown
- [Mono-repo structure](reference_monorepo.md) — build-on-openclaw submodule layout
- [Rust conventions](feedback_rust.md) — prefer thiserror over anyhow in libraries
- [Deploy process](reference_deploy.md) — Transporter for Mac App Store, Homebrew tap auto-updated by CI
```

### 3.5 `groups.json` and `groups/` — Workspace Group Definitions

`groups.json` lists named groups of related workspaces (e.g., a client engagement that spans multiple repos). Each entry carries a `slug`, `name`, `description`, and a list of workspace paths belonging to the group.

The `groups/<group-slug>/` directory mirrors the user-level layout in miniature: a `memory/` subdirectory for shared knowledge notes scoped to the group, and an `agents/` subdirectory for agents shared across all workspaces in that group. Group-level agents and memory are loaded in addition to user-level ones when any workspace in the group is active.

### 3.6 `providers.json` — LLM Provider Registry

Declares LLM providers available to the app (e.g., Anthropic, OpenAI, Ollama, custom OpenAI-compatible endpoints). Each entry specifies the provider `slug`, `name`, `base_url`, `model_ids`, and whether it is `enabled`. API keys are referenced via `${keychain:*}` — never stored inline. This file takes precedence over any provider settings previously stored in `settings.db`.

### 3.7 `tools.json` — CLI Tool Registry & Slots

Declares external CLI tools LiteDuck can invoke (e.g., `gh`, `docker`, `cargo`, `npm`). Each entry specifies the tool `slug`, the resolved binary `path` (or `null` if auto-discovered from `$PATH`), and optional `args` defaults. Workspace configs may override individual tool slots.

### 3.8 `agents-council/` — AgentsCouncil Configurations

User-level customizations for the AgentsCouncil workflow engine:

| Path | Purpose |
|------|---------|
| `pipelines/` | Custom pipeline definitions (YAML) |
| `presets/` | Council presets — named collections of pipeline + agents + voting rules |
| `phases/` | Custom phase block definitions |
| `prompts/` | Prompt template overrides (replaces bundled defaults) |
| `voting-rules/` | Custom vote-aggregation logic |
| `gates/` | Custom quality and security gate definitions |
| `hooks.json` | Lifecycle hooks (pre-phase, post-phase, on-failure, etc.) |

These files are merged with workspace-level AgentsCouncil configs: workspace definitions take precedence; user-level definitions provide the fallback.

### 3.9 `templates/` — Workspace Bootstrap Templates

When `workspace_init` runs, it first checks `~/.LiteDuck/templates/` before falling back to the bundled resources. This lets users customize their default workspace setup without modifying the app bundle.

**Resolution order:**
1. `~/.LiteDuck/templates/workspace/CLAUDE.md` (user override)
2. `<app-bundle>/resources/CLAUDE.md` (bundled default)

### 3.10 `mcp/servers.json` — Global MCP Server Registry

```json
{
  "version": 1,
  "servers": [
    {
      "slug": "filesystem",
      "name": "Filesystem MCP",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-filesystem"],
      "enabled": true,
      "global": true
    },
    {
      "slug": "github",
      "name": "GitHub MCP",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": { "GITHUB_TOKEN": "${keychain:github_token}" },
      "enabled": true,
      "global": true
    }
  ]
}
```

Note: `${keychain:key_name}` references are resolved at runtime from the OS keychain — secrets never appear in config files.

---

## 4. Storage Hierarchy & Precedence

With `~/.LiteDuck`, the full storage model becomes two tiers plus a runtime-state concern:

```
┌─────────────────────────────────────────────────────────┐
│  Tier 1: User-level (~/.LiteDuck/)                      │
│  ─ Global config, profile, cross-workspace memory       │
│  ─ Global agents, templates, MCP servers                │
│  ─ Human-readable (markdown + JSON)                     │
│  ─ Optionally version-controlled by user                │
├─────────────────────────────────────────────────────────┤
│  Tier 2: Workspace-level (<workspace>/.LiteDuck/)       │
│  ─ Project-specific scrum, agents, chat                 │
│  ─ Committed to the repo (team-shared)                  │
│  ─ Markdown-first for Git compatibility                 │
└─────────────────────────────────────────────────────────┘

Runtime state (not a storage tier — ephemeral, not user-editable):
  ─ PTY sessions (in-process managed state)
  ─ OS keychain cache (5 min TTL, secrets only)
  ─ ~./LiteDuck/cache/ (safe to delete)
```

> **Note:** The platform app data directory (`~/Library/Application Support/com.bemindlabs.liteduck/`) held `settings.db` and related SQLite files before ADR-001. After migration those files are archived and no longer read. See Section 5.2.

**Merge strategy** (workspace overrides global):

| Setting | Tier 1 (Global) | Tier 2 (Workspace) | Effective |
|---------|-----------------|-------------------|-----------|
| AI model | `claude-sonnet-4-6` | `claude-opus-4-6` | `claude-opus-4-6` |
| Agent profiles | `~/.LiteDuck/agents/qa/` | `<ws>/agents/qa/` | Workspace version |
| MCP servers | Global servers.json | Workspace servers.json | Union (both active) |
| Memory | Global MEMORY.md | Workspace agent memory | Both loaded, workspace takes precedence on conflicts |

---

## 5. Initialization

### 5.1 First Launch

On first app launch, if `~/.LiteDuck/` does not exist:

1. Create `~/.LiteDuck/` directory structure
2. Generate `config.json` with sensible defaults
3. Create empty `profile.md` with frontmatter skeleton
4. Create empty `workspaces.json`
5. Create `memory/MEMORY.md` (empty index)
6. Create `cache/`, `logs/` directories
7. **Do not** migrate existing data automatically — offer a migration wizard

### 5.2 Migration from Current Layout

Data currently in `~/Library/Application Support/com.bemindlabs.liteduck/`:

| Current | Migrates to | Strategy |
|---------|-------------|----------|
| `settings.db` (non-secret rows) | `~/.LiteDuck/config.json` | One-time export of all known keys to JSON |
| `settings.db` (workspace_history) | `~/.LiteDuck/workspaces.json` | Parse JSON array, enrich with metadata |
| `automations.db` | `~/.LiteDuck/automations/*.json` | Export rows to individual JSON files |
| `mcp.db` | `~/.LiteDuck/mcp/servers.json` | Export server configs |
| `liteduck.log` | `~/.LiteDuck/logs/liteduck.log` | Redirect log output path |
| OS keychain entries | *(no change)* | Secrets stay in keychain |

**Migration is a one-time operation.** The app runs a migration dialog on first launch after upgrade. Once the user confirms, all relevant data is written to `~/.LiteDuck/` and the old SQLite files (`settings.db`, `automations.db`, `mcp.db`) are renamed to `*.db.bak` (archived in place). After migration completes, `settings.db` is never read again — `~/.LiteDuck/config.json` is the sole source of truth for configuration.

---

## 6. Rust Implementation Outline

### 6.1 New Module: `home.rs`

```rust
//! ~/.LiteDuck home directory management.

use std::path::{Path, PathBuf};

/// Returns the LiteDuck home directory path.
/// Uses $LITEDUCK_HOME if set, otherwise ~/.LiteDuck
pub fn home_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("LITEDUCK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".LiteDuck")
}

/// Ensure the ~/.LiteDuck directory structure exists.
/// Safe to call on every launch — creates only missing dirs/files.
pub fn ensure_home() -> Result<(), String> { ... }

/// Resolve a config value with workspace override precedence.
/// Resolution chain: workspace config.json → global config.json → built-in default.
/// SQLite (settings.db) is NOT in the resolution chain.
pub fn resolve_config<T>(key: &str, workspace: Option<&Path>) -> Option<T> { ... }

/// Read the global memory index.
pub fn memory_index() -> PathBuf {
    home_dir().join("memory").join("MEMORY.md")
}

/// Read the workspace registry.
pub fn workspaces_path() -> PathBuf {
    home_dir().join("workspaces.json")
}
```

### 6.2 Environment Variable Override

`LITEDUCK_HOME` allows overriding the root path for:
- CI/CD environments
- Testing with isolated directories
- Users who prefer XDG-style paths (`~/.config/liteduck`)

### 6.3 New Tauri Commands

```rust
#[tauri::command] fn home_dir() -> String;
#[tauri::command] fn home_ensure() -> Result<(), String>;
#[tauri::command] fn home_config_read() -> Result<Config, String>;
#[tauri::command] fn home_config_write(config: Config) -> Result<(), String>;
#[tauri::command] fn home_profile_read() -> Result<String, String>;
#[tauri::command] fn home_profile_write(content: String) -> Result<(), String>;
#[tauri::command] fn home_workspaces_list() -> Result<WorkspaceRegistry, String>;
#[tauri::command] fn home_workspaces_update(registry: WorkspaceRegistry) -> Result<(), String>;
#[tauri::command] fn home_memory_list() -> Result<Vec<MemoryNoteSummary>, String>;
#[tauri::command] fn home_memory_read(slug: String) -> Result<MemoryNote, String>;
#[tauri::command] fn home_memory_write(note: NewMemoryNote) -> Result<String, String>;
#[tauri::command] fn home_memory_delete(slug: String) -> Result<(), String>;
#[tauri::command] fn home_memory_search(query: String) -> Result<Vec<MemoryNoteSummary>, String>;
#[tauri::command] fn home_templates_list() -> Result<Vec<TemplateInfo>, String>;
#[tauri::command] fn home_migration_check() -> Result<MigrationStatus, String>;
#[tauri::command] fn home_migration_run() -> Result<MigrationResult, String>;
```

### 6.4 Frontend Wrappers

New file: `src/lib/home.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";

export const homeDir        = () => invoke<string>("home_dir");
export const homeEnsure     = () => invoke<void>("home_ensure");
export const homeConfigRead = () => invoke<Config>("home_config_read");
// ... etc.
```

---

## 7. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Secrets in config files | Forbidden. All secrets are stored exclusively in the OS keychain. The only way to reference a secret in a config file is via a `${keychain:key_name}` placeholder, resolved at runtime. No plain-text secrets, no `.env` files, no environment variable injection. |
| Secrets via environment variables | Forbidden. Do not accept or pass secrets through environment variables in production paths. CI secrets are injected into the keychain at setup time, not read from `process.env` at runtime. |
| File permissions | `~/.LiteDuck/` created with `0o700` (user-only). Config/profile files with `0o600`. |
| Cache poisoning | Cache is ephemeral — `cache/` can be deleted without data loss. Integrity checks on model metadata. |
| Workspace path traversal | Validate all workspace paths are absolute and within allowed directories. |
| Profile data exposure | `profile.md` is local-only. No telemetry sends profile data. Clear warning in file header. |

---

## 8. Compatibility

### Cross-Platform Paths

| Platform | Default Path |
|----------|-------------|
| macOS | `~/.LiteDuck/` |
| Linux | `~/.LiteDuck/` |
| Windows | `%USERPROFILE%\.LiteDuck\` |

The `.LiteDuck` name (with leading dot) is intentional:
- Hidden by default on macOS/Linux (dot-file convention)
- Consistent across platforms (Windows shows it normally)
- PascalCase matches the product name for discoverability

### Backward Compatibility

- Versions prior to the ADR-001 migration read from `settings.db` — those builds are unaffected until they are upgraded.
- After migration, `~/.LiteDuck/config.json` is the sole source of truth. `settings.db` is archived as `settings.db.bak` and never written to or read from again.
- The migration wizard preserves all data — no configuration is lost. Users can inspect `settings.db.bak` manually if needed.
- Apps built before this feature gracefully ignore `~/.LiteDuck/` (it is opt-in at the code level until the migration runs).

---

## 9. Relationship to Workspace `.LiteDuck/`

```
~/.LiteDuck/                          <workspace>/.LiteDuck/
├── config.json     ← global defaults  ├── config.json     ← workspace overrides
├── agents/         ← global agents     ├── .agents/        ← workspace agents
├── memory/         ← user knowledge    ├── .agents/memory/ ← project knowledge
├── templates/      ← bootstrapping     ├── .scrum/         ← project scrum data
├── mcp/            ← global MCP        └── .chat/          ← project chat history
└── automations/    ← global automations
```

**Key distinction:**
- `~/.LiteDuck/` = **who you are** (identity, preferences, cross-project knowledge)
- `<workspace>/.LiteDuck/` = **what you're building** (project data, team-shared)

---

## 10. Future Extensions

- **`~/.LiteDuck/sync/`** — Optional sync metadata for cloud backup (encrypted)
- **`~/.LiteDuck/themes/`** — Custom UI themes (CSS/JSON)
- **`~/.LiteDuck/keybindings.json`** — Custom keyboard shortcuts
- **`~/.LiteDuck/snippets/`** — Code snippet library
- **`~/.LiteDuck/hooks/`** — Global lifecycle hooks (pre-commit templates, etc.)
