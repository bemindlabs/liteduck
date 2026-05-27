# LiteDuck Vision

> **The Way of the Duck** — AI operates, humans govern. Calm on the surface, relentless underneath.

## Mission

LiteDuck is the **AI-first software development workspace** where autonomous agents drive the full development loop and humans govern at the gates. We are not building a better IDE. We are building a new paradigm: a deliberative AI council that plans, codes, reviews, and ships — while you stay in control of every consequential decision.

## Core Pillars

### 1. AI Operates, Humans Govern

The fundamental shift: AI is the operator, not the assistant. Specialist agents decompose requirements, estimate work, write code, run tests, and open pull requests. Humans approve, modify, or reject at defined gates — never micromanage the in-between.

Every gate is explicit. Every approval is meaningful. Nothing ships silently.

### 2. AgentsCouncil — A Deliberative AI Council

Before a single line of code is written, a council of specialist agents runs full SCRUM ceremonies autonomously:

- **Decomposition:** Break epics into stories and tasks with clear acceptance criteria.
- **Refinement:** Challenge assumptions, surface risks, propose alternatives.
- **Estimation:** Independent sizing from each agent, debated to consensus.
- **Voting:** Unanimous agreement required before parallel autonomous development begins.

No lone agent acts unilaterally. Consensus is the unlock.

### 3. Markdown + JSON as Source of Truth

All persistent data — stories, sprint boards, agent memory, workspace config — lives as human-readable files. Git-friendly, portable, inspectable without a database client.

SQLite is used only as a runtime index for fast queries. The files are always the authority. If you delete the index, it rebuilds. If you lose the app, your data survives.

### 4. Universal Impact Analysis

Every modification — by an agent or a human — triggers impact analysis before it is applied. Dependency graphs are walked. Affected tests are identified. Risk surfaces are surfaced. No change is silent, and no change is surprising.

### 5. Quality Gate + Security Gate

Automated verification is a first-class citizen, not an afterthought:

- **Quality Gate:** Lint, type-check, test coverage thresholds, build validation — configurable per phase.
- **Security Gate:** OWASP review, dependency audit, secret scanning — runs before any code reaches a human gate.
- **Auto-fix pipeline:** Agents attempt remediation before escalating to a human.

Gates are tunable. Teams define what "done" means.

### 6. Five-Layer Memory

Knowledge is cumulative and flows deliberately:

```
Agent → Workspace → Group → Global → Shared
```

An agent learns from a task. That learning can promote to workspace, then to a group of related workspaces, then to your global profile at `~/.LiteDuck`, then — with your consent — to shared team memory. No knowledge is siloed by default. No knowledge escapes without intent.

### 7. ~/.LiteDuck Application Home

A user-level persistent home that travels with the developer, not the project:

- Cross-workspace agent memory and profiles
- Global provider registry (models, API keys, fallback chains)
- Tool registry for composable pipeline stages
- Workspace groups for managing related projects as a fleet

Your intelligence, your configuration, your rules — portable across every machine you work on.

### 8. Flexible LLM Providers

No vendor lock-in at the model layer. Every agent can be assigned its own model. Fallback chains handle outages gracefully. Cost tracking surfaces spending before it becomes a surprise.

Supported providers: Anthropic, OpenAI, Google, Ollama, Bedrock, Azure — and any provider that speaks a compatible API.

### 9. Dynamic Customization

LiteDuck is a platform, not a fixed workflow:

- Composable pipeline builder: add, remove, or reorder phases.
- Custom phases: inject your own scripts, tools, or agents.
- Tunable agent behaviors: adjust verbosity, risk tolerance, consensus rules.
- Swappable CLI tools: bring the tools your team already trusts.

The default pipeline is opinionated. The system is not.

## Enduring Principles

**Local-First, Always.** Sensitive data, credentials, and workspace state stay on your machine. The cloud is optional and explicit.

**Radical Simplicity at the Surface.** The complexity of a multi-agent council should be invisible during normal flow. What the developer sees is calm, clear, and decisive.

**Privacy and Portability.** Your agents, your memory, your models. LiteDuck never owns your workflow.

**Open Standards.** A2A (Agent-to-Agent) and MCP (Model Context Protocol) are first-class. LiteDuck participates in the ecosystem; it does not try to replace it. The Internal MCP system makes every module a discoverable, callable service — and exposes the same tools to external AI agents via a standard MCP bridge.

## Realized

**Coding Workflow.** AI-powered multi-step plan generation and execution with persistence — the first concrete expression of agents driving the development loop.

**iOS App.** Tauri v2 iOS app with edge-to-edge WebView, mobile-optimized UI, swipe gestures, and haptic feedback. The duck glides on mobile too.

**Skills and Plugins.** Browse and install OpenClaw skills. Enable and disable gateway plugins. The extensibility layer is live.

**Setup Wizard with Scrum Process.** Six-step first-run wizard that configures workspace directory, AI gateway, GitHub, and scrum process defaults — sprint duration, Definition of Done checklist, and team members. All scrum settings editable post-setup in a dedicated Settings section. The duck is opinionated about process from the first launch.

**Internal MCP — Inter-Module Communication.** All 11 backend modules expose their capabilities as MCP tools through a unified in-process registry. Any module can discover and call tools from any other module. A pub/sub bus propagates state changes across modules in real time. An external MCP bridge on port 18790 exposes all 41 internal tools to external AI agents — Claude Desktop, Cursor, or any MCP-compatible client connects and operates LiteDuck programmatically. This is the nervous system that makes the duck's paddle strokes coordinated.

**AI-Powered Scrum Generation.** Generate epics, stories, and backlogs from natural language prompts. The AI generators bridge human intent to structured scrum artifacts — describe what you want, and the council has material to deliberate on.

**Dev Task Runner.** Council-approved stories flow into a background parallel executor with bounded concurrency. Progress animations — shimmer bars, pulsing indicators, elapsed timers — surface the work as it happens. Stale lock detection and auto-reset ensure the pipeline never gets stuck. The first concrete bridge between deliberation and execution.

## Future Horizons

**Fleet Mode.** Manage a group of related workspaces as a single coordinated fleet. Cross-workspace impact analysis. Shared sprint boards. One council governing many repos.

**Collaborative Autonomy.** Shared agent councils for distributed teams. Peer-to-peer LAN coordination. Scrum boards that live in the repo and sync across machines.

**Cross-Platform Mastery.** The Way of the Duck is available to every developer on every OS. macOS and iOS today, Windows and Linux on the horizon, without compromise.

---

*LiteDuck: The duck glides. The agents paddle furiously beneath. You watch, decide, and ship.*
