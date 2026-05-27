# ADR-001: LoopDuck → LiteDuck — Editor-Only Scope

> **Status:** Accepted
> **Date:** 2026-05-27
> **Scope:** Whole-product scope and architecture
> **Supersedes:** the prior "Single Direction — AI-Driven, Human-in-the-Loop, Markdown-First" decision that occupied this ADR number

---

## Context

LiteDuck began life as **LoopDuck**: an "AI-first software development workspace" in which
autonomous agents drove the development loop and humans governed at the gates. Over time
that product accumulated a large, interdependent surface:

- An **AgentsCouncil / AgentsSCRUM** deliberation pipeline — multi-phase scrum ceremonies
  run by specialist agents.
- A **coding workflow** engine, **pipelines**, and an **automations runner**/orchestrator.
- **AI chat / Ask AI** backed by an **OpenClaw** LLM gateway.
- **Internal and external MCP** bridges and **Agent-to-Agent (A2A)** transport.
- **Team chat** over LAN/BLE mesh, **Docker/Compose**, **SSH/SFTP**, and **GitHub/Jira**
  integrations.

This breadth came at a cost: a heavy binary, a wide attack surface, hard-to-test
interdependencies, network and API dependencies for basic use, and a fuzzy product
identity. The fast native editor underneath — file browser, terminal, and Git — was the
part users relied on every minute, and it was buried under everything else.

## Decision

**Strip LoopDuck down to an editor-only product: LiteDuck.**

LiteDuck keeps exactly four capabilities:

1. **File browser + editor**
2. **Integrated terminal** — PTY, tabs, splits, tmux
3. **Git** — status, log, diffs, branches, worktrees (libgit2)
4. **Settings** — modular, keychain-backed secrets, biometric lock, device identity

Everything tied to the AI-first vision is **removed and out of charter**:

| Removed | Notes |
|---|---|
| AI / LLM features, Ask AI, code generation | No inference, no model providers |
| Agents, agent memory UI, AgentsCouncil / AgentsSCRUM | No autonomous actors |
| Scrum, kanban, sprints, epics, stories | No project-management layer |
| Coding workflow, pipelines, automations runner, orchestrator | No workflow engine |
| OpenClaw gateway | No external AI gateway |
| Internal / External MCP, A2A | No agent-interop bridges |
| Team chat, LAN/BLE mesh | No messaging or transport |
| Docker / Compose | No container management |
| SSH / SFTP, embedded browser | No remote-execution surfaces |
| GitHub / Jira integrations, cloud / iCloud sync | No cloud dependencies |

## Consequences

**Positive**

- **Smaller, faster, calmer.** Fewer dependencies, lower memory, quick cold start.
- **Narrow attack surface.** No network gateway, no localhost MCP bridge, no
  remote-execution panels.
- **Local-first and private.** The app opens and runs with no accounts, telemetry, or
  inference calls.
- **Testable core.** The four remaining domains have clear boundaries and IPC contracts.
- **Clear identity.** LiteDuck is "a lightweight code editor," full stop.

**Negative / trade-offs**

- The AI/agent/scrum capabilities are gone; users who wanted them must look elsewhere.
- Older design docs (`design-liteduck-home.md`, `design-settings-redesign.md`,
  `design-workspace-data-isolation.md`) still describe the AI-driven architecture and the
  prior "single direction" decision. They are **historical** and no longer authoritative
  for the editor-only product.

## What We Kept

A few sound infrastructure decisions from the LoopDuck era survive because they serve the
editor just as well:

- **Files are the source of truth.** Settings live in human-readable JSON (`~/.LiteDuck` +
  `<workspace>/.LiteDuck`); SQLite is only a rebuildable runtime index, never authoritative
  for user data.
- **Workspace-as-directory.** A workspace is self-contained in its folder; moving the folder
  moves everything.
- **Secrets in the OS keychain**, gated by an optional biometric lock.

> Note: the on-disk data directory is still named `.LoopDuck` in some builds to avoid a
> churny path migration. Everything user-visible is "LiteDuck."

## Status of the Prior ADR

This document **replaces** the earlier "Single Direction — AI-Driven, Human-in-the-Loop,
Markdown-First" decision recorded under ADR-001. The *Markdown/JSON-as-source-of-truth* and
*workspace-as-directory* principles from that ADR are **retained** (see "What We Kept"). The
*AI-drives / human-supervises* workflow, the AgentsCouncil pipeline, the five-layer memory
promotion, and the MCP/A2A surfaces it described are **withdrawn** along with the features
they governed.

---

*LiteDuck: do less, better.*
