# Design: `~/.LiteDuck` — Application Memory Root (Superseded / Historical)

> **Status:** Superseded — historical (no longer authoritative)
> **Original date:** 2026-04-09
> **Superseded by:** [ADR-001: Editor-Only Scope](adr-001-single-direction.md)

> **Note:** This document described the user-level `~/.LiteDuck` storage root as the home for a prior **AI-agent architecture** — cross-workspace agent memory, global agent profiles, an AgentsCouncil configuration tree, MCP server registries, automations, and LLM provider settings. That architecture has been removed: LiteDuck is now an editor-only, single-user app (file browser + editor, terminal, Git, Settings), and none of those AI/agent/MCP/automation features exist. The general idea of a single global storage root for config, profile, templates, and memory survived the cut, but its current, accurate layout is documented in the project [CLAUDE.md](../CLAUDE.md) (“Storage”) — not in the AI-oriented structure described here. The decision that removed the AI-agent features is recorded in [ADR-001](adr-001-single-direction.md). This file is retained only as historical context.
