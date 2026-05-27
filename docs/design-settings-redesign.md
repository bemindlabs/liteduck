# Design: EPIC-10 — Settings Page Redesign (Superseded / Historical)

> **Status:** Superseded — historical (no longer authoritative)
> **Original date:** 2026-04-09
> **Superseded by:** [ADR-001: Editor-Only Scope](adr-001-single-direction.md)

> **Note:** This document specified a settings redesign whose `Config` model centered on features that have since been **removed** — AI/LLM gateway settings, LLM providers, an Agents section, Workspace Groups, Network (LAN/BLE/mesh), Integrations (GitHub/Jira/Telegram/Docker), MCP servers, and an agent-driven config-change gate (A2A companion API). LiteDuck is now an editor-only, single-user app, and those settings sections no longer exist. The settings that actually shipped (General, Workspace, Git, Shortcuts, Device Identity, Biometric Lock, Permissions, About, Danger Zone) are described in the project [CLAUDE.md](../CLAUDE.md). The sound infrastructure idea underneath — JSON config as the source of truth instead of SQLite, with a typed `useConfig()` hook and auto-save — survived, but its current shape is documented in CLAUDE.md and the shipped code, not here. The scope decision that removed the AI-agent surface is recorded in [ADR-001](adr-001-single-direction.md). This file is retained only as historical context.
