# Design: EPIC-9 — Workspace-Scoped Data Isolation (Superseded / Historical)

> **Status:** Superseded — historical (no longer authoritative)
> **Original date:** 2026-04-09
> **Superseded by:** [ADR-001: Editor-Only Scope](adr-001-single-direction.md)

> **Note:** This document designed per-workspace isolation of features that have since been **removed** — scrum projects, automations, AI chat history, agent memory, and MCP server configs stored under each `<workspace>/.LiteDuck/`. LiteDuck is now an editor-only, single-user app (file browser + editor, terminal, Git, Settings); scrum, automations, chat, agents, and MCP no longer exist, and the app stores its data globally rather than per-workspace. The entire premise of this document therefore no longer applies. The decision that removed these features is recorded in [ADR-001](adr-001-single-direction.md); for the current architecture and storage layout, see the project [CLAUDE.md](../CLAUDE.md). This file is retained only as historical context.
