# LiteDuck Vision

> **The Way of the Duck** — calm, fast, and out of your way.

## Mission

LiteDuck is a **lightweight, focused code editor**: a file browser + editor, an integrated
terminal, Git, and Settings in one fast native desktop app. It does one thing well — give
you a calm place to read, edit, and ship code — and deliberately stops there. No AI, no
agents, no chat, no cloud. Just your files and the tools you reach for every minute.

LiteDuck was carved out of "LoopDuck", a heavier AI-first workspace. We removed the agents,
the AI council, the scrum pipeline, the chat, and the remote integrations, and kept the fast
native editor underneath. The result is smaller, quieter, and entirely yours.

## Core Pillars

### 1. Lightweight and Fast

A native Tauri v2 app with a Rust backend and a small footprint. Cold start is quick, memory
stays low, and the UI never gets in your way.

### 2. Focused Scope

Four capabilities, done well: **file browser + editor**, **integrated terminal**, **Git**,
and **Settings**. We say no to scope creep. Anything that would pull LiteDuck back toward an
AI platform — agents, LLM chat, orchestration, always-on cloud — is out of charter.

### 3. Local-First and Private

Everything runs on your machine. No accounts, no telemetry, no inference calls, no network
dependency to open a file. The cloud is never required.

### 4. Your Files Are the Source of Truth

A workspace is just a directory. Settings live in human-readable JSON (`~/.LiteDuck` and
`<workspace>/.LiteDuck`); SQLite is only a rebuildable runtime index. Move the folder and
everything moves with it. Lose the app and your work survives.

### 5. Keyboard-Driven

A command palette (Cmd+K) and consistent shortcuts put every action a keystroke away.
Terminal tabs, Git, settings, focus mode — all reachable without the mouse.

### 6. Secure by Default

Secrets live in the OS keychain (Apple Keychain, Windows Credential Manager, Linux Secret
Service). An optional biometric lock guards the app, and a per-machine device identity is
generated locally.

### 7. macOS-First, Native Everywhere (Windows & Linux planned)

LiteDuck is a native macOS app today; Windows and Linux are planned. The foundation stays
platform-neutral — native window chrome, native keychain, native menus — so parity is the
goal, not a lowest common denominator.

## Enduring Principles

**Calm on the surface.** The editor should feel quiet and predictable. Nothing happens that
you didn't ask for.

**Do less, better.** Three sharp tools beat thirty dull ones. When in doubt, we cut.

**Own your workflow.** Your files, your settings, your machine. LiteDuck never owns your data
or your process.

**Honest about scope.** LiteDuck is an editor. It is not an IDE, not an AI assistant, not a
project-management suite. When a request would change what LiteDuck *is*, the answer is
usually no — and that's the point.

## What LiteDuck Is Not

To keep the charter clear, LiteDuck deliberately has **no**:

- AI / LLM features, code generation, or chat
- Autonomous agents, an AI council, or scrum / pipeline orchestration
- Agent-to-Agent (A2A) or MCP servers / bridges
- Docker, SSH/SFTP, or remote-execution panels
- GitHub / Jira integrations or cloud sync

These existed in LoopDuck and were intentionally removed. See [ADR-001](docs/adr-001-single-direction.md).

Extensibility instead lives in the **plugin system** — including a plugin's own UI, served from
an isolated `plugin://` origin with no access to the host or its privileges
([ADR-002](docs/adr-002-plugin-ui-extension-host.md)). This adds *rendering* surface, not the
list above: the `chat` / `agent` / `llm` deny-list and the no-AI charter are unchanged.

## Future Horizons

Within the editor-only charter:

**Windows & Linux (planned).** First-class Windows and Linux parity alongside macOS-first —
native chrome and shortcuts on every OS.

**A Better Editor.** Multi-file tabs, find/replace and project-wide search, richer previews.

**Themes and Customization.** Make the editor yours without making it heavy.

**Performance as a Feature.** Cold-start and memory budgets tracked over time.

---

*LiteDuck: your files, a terminal, and Git. Nothing you didn't ask for.*
