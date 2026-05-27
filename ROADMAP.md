# LiteDuck Roadmap

> AI-first software development workspace — autonomous agents drive the loop, humans govern at the gates.

**Current version:** 2026.4.14 (CalVer)
**Platforms:** Mac App Store, Homebrew, direct download

### Progress

```
Shipped      █████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░  50%  (27)
In Progress  █████████████████████████████░░░░░░░░░░░░░░░░░░░░░  59%  (32)
Planned      █████████████████████████████████████████████████░░  94%  (51)
Full Vision  ██████████████████████████████████████████████████░  100% (54)
```

### Release Timeline

```mermaid
gantt
    title LiteDuck Delivery Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %Y
    todayMarker on

    section Shipped
    Developer Tooling and UX           :done, s1, 2026-02-01, 2026-03-01
    Workflow and Agent Tooling         :done, s2, 2026-03-01, 2026-04-01
    Platform Stability and Mobile      :done, s3, 2026-04-01, 14d
    Internal MCP and Dev Tasks         :done, s4, 2026-04-14, 1d
    Council to Workflow Bridge         :done, s5, 2026-04-14, 1d

    section In Progress
    Test Coverage Backfill             :active, ip1, 2026-04-15, 2026-06-01
    Production Panic Fix and Unwrap Audit :active, ip2, 2026-04-15, 2026-05-15
    Bridge Polish and E2E Tests        :active, ip3, 2026-04-15, 2026-05-15
    Internal MCP Adoption (chat, docker) :ip4, 2026-05-01, 2026-06-01
    LAN and BLE Hardening              :ip5, 2026-05-15, 2026-06-15
    ESLint and Prettier Cleanup        :ip6, 2026-04-20, 10d

    section Quality and Testing
    Quality Gate Hardening             :q1, 2026-05-15, 2026-06-30
    AgentsCouncil Review Polish          :q2, 2026-05-15, 2026-06-30
    E2E Playwright in CI               :q3, 2026-05-01, 2026-06-01

    section Security Foundations (IAP Gate)
    Bash Validator Injection Defense   :crit, sec1, 2026-05-01, 2026-06-01
    MCP Bridge Threat Model and Auth   :crit, sec2, 2026-05-15, 2026-06-30
    Cargo Audit and Deny in CI         :crit, sec3, 2026-05-01, 14d
    Secret Handling Docs               :sec4, 2026-06-01, 2026-06-15

    section AI and Agents
    RAG Project Context                :a1, 2026-06-15, 2026-08-01
    Multi-Agent Swarm                  :a2, 2026-07-01, 2026-09-01
    Memory Promotion Pipeline          :a3, 2026-07-15, 2026-09-01
    A2A Protocol Improvements          :a4, 2026-07-15, 2026-09-01

    section Developer Tooling
    Git Multi-Root and Submodules      :d1, 2026-06-15, 2026-07-31
    MCP Ecosystem Expansion            :d2, 2026-07-15, 2026-09-01
    Offline Local LLM                  :d3, 2026-08-15, 2026-10-01

    section In-App Purchase
    iCloud Integration                 :after sec2, iap1, 45d
    Cloud Sync                         :iap2, after iap1, 60d
    SSH Tunnel Multi-Provider          :iap3, 2026-09-01, 2026-10-15
    Remote Controls                    :iap4, after iap2, 45d

    section Platform
    Android Support                    :p1, 2026-09-01, 2026-11-01
    Windows and Linux Polish           :p2, 2026-10-01, 2026-11-15

    section Future Horizons
    Fleet Mode                         :f1, 2026-11-15, 2027-02-01
    Collaborative Autonomy             :f2, 2026-12-01, 2027-03-01
    Universal Impact Analysis          :f3, 2027-01-15, 2027-04-01
    Quality and Security Gates         :f4, 2027-01-15, 2027-04-01
    Dynamic Customization              :f5, 2027-02-15, 2027-05-01
    Flexible LLM Providers             :f6, 2027-02-15, 2027-05-01
```

---

## In Progress

Current sprint: raise test coverage, harden production reliability, and close security foundations before the IAP track begins. Keep concurrent lanes tight — finish P0 before pulling from P1.

### P0 — Must ship

- **Test coverage backfill** `In progress`
  Unit tests for the 14 untested pages — AgentsCouncilPage, ScrumPage, GitPage, ChatPage, TerminalPage are highest priority. Raise Vitest thresholds from 3–5% toward 70% incrementally.

- **Fix production panics** `Queued`
  Convert 3 `panic!()` calls in `workflow_recovery.rs` and `settings.rs` to `Result` types. Audit bare `unwrap()` calls in Rust backend (~799 occurrences; separate crash-risk from safe defaults via `clippy::unwrap_used`).

- **AgentsCouncil → Coding Workflow bridge polish** `In progress`
  Bridge shipped in v2026.4.14 (`dev_task_start` accepts `scrum_session_id`, auto-advance DevMode → Review). Remaining: end-to-end test coverage, edge cases for partial-failure batches, UI polish on the handoff.

### P1 — Should ship

- **Internal MCP adoption** `In progress`
  Wire chat and docker modules to publish resource changes via `InternalMcpBus` (terminal provider shipped in v2026.4.14). Extend bus coverage beyond scrum/agents_council/coding_workflow/terminal.

- **LAN/BLE hardening** `Queued`
  Integration tests for peer discovery, mesh routing, and offline delivery queue after russh 0.60 upgrade.

- **ESLint + Prettier cleanup** `Queued`
  Fix 11 ESLint errors (catch block types, floating promises) and 15 Prettier formatting issues.

### P2 — Nice to ship

- **E2E Playwright in CI** `Queued`
  9 spec files exist but aren't in the quality gate; wire into CI and cover onboarding flow.

---

## Planned

Near-term priorities grouped by theme, roughly in delivery order.

### Quality and Testing

**Quality Gate Hardening** (next)
Raise Vitest coverage thresholds from 3-5% to 70%. Integrate Playwright E2E into the CI quality gate. Add pre-commit hooks for formatting. The existing `npm run quality-gate` pipeline is comprehensive — the thresholds just need to match reality.

**AgentsCouncil Review + Retrospective Polish**
The Review and Retrospective phases (~600 LOC) are implemented but rarely exercised. Run full end-to-end council sessions through all 8 phases, fix edge cases, and add test coverage for the later phases.

### Security Foundations (gate before IAP track)

These items must land before Remote Controls, Cloud Sync, or any feature that extends the attack surface beyond loopback. Without them, opening cloud relays or multi-device sync exposes known weaknesses.

**Bash validator shell injection detection**
`bash_validator.rs` currently classifies command *intent* (read/write/destructive/network) but does not defend against shell metacharacter injection (`$()`, backticks, `;`, `&&`, `|`). Add metacharacter scanning or integrate `shell-words`. A `curl $(malicious_input)` should be blocked or escaped, not classified as a plain Network command.

**Internal MCP bridge threat model and auth**
The external MCP bridge on `127.0.0.1:18790` has no auth or rate limiting. Localhost binding is safe for the default case, but Docker bridges and WSL2 loopback can expose it. Write `SECURITY.md` documenting the threat model, add an optional token handshake for future remote access, and cap request body size beyond the current 1 MB default.

**Supply-chain audit in CI**
Add `cargo audit` and `cargo deny` to the `ci.yml` quality gate. Run on every PR to catch vulnerable or yanked crates before merge. Complements the existing `npm audit` coverage.

**Secret-handling documentation**
Document the session-lifetime secret cache (365-day TTL in `keychain.rs`), the PLAIN_KEYS vs SECRET_KEYS split, and the biometric gate interaction in a single `docs/design-secrets.md`. Future maintainers shouldn't need to reverse-engineer this from code.

### AI and Agents

**RAG Auto-Generated Project Context**
Automatically index the workspace into a RAG store on first open and incrementally on file change. Indexed artifacts: source files, docs, commit messages, scrum stories. AI chat and agent prompts transparently retrieve relevant context before inference. Index stored in `<workspace>/.LiteDuck/rag/` with configurable chunking, embedding provider (OpenAI, Ollama, or gateway-proxied), and ignore patterns via `.liteducknore`.

**Multi-Agent Synchronization and Swarm Execution**
Coordinate multiple agents on a single task as a swarm. An orchestrator distributes sub-tasks, enforces ordering, and merges results. Agents share a live context overlay (files touched, locks held, decisions made) to prevent conflicts. Built on Internal MCP pub/sub for intra-process swarms and A2A transport for cross-machine swarms. Configurable concurrency limits and consensus quorum per task.

**Memory Promotion Pipeline**
Extend 3-layer memory (Agent -> Workspace -> Global) with Group and Shared layers. Consent-gated promotion: agent notes surface "promote to workspace", workspace notes promote to global, global notes share with peers via LAN transport.

**Agent-to-Agent Protocol Improvements**
Richer A2A message types, capability negotiation, and discovery reliability. Reduce handshake latency for multi-agent LAN workflows. Bridge A2A with Internal MCP so agents discover each other's tools.

### Developer Tooling

**Git Multi-Root and Submodule View**
Support workspaces with multiple `.git` roots and git submodules. The Git page gains a repository switcher showing each root and submodule as a navigable tree. Status, diff, log, and staging scope to the selected repo. Submodule state (checked-out commit, dirty flag, remote tracking) in a dedicated panel with bulk actions for recursive pull, init, and sync.

**MCP Server Ecosystem Expansion**
Extend the Internal MCP bridge with richer tool schemas, SSE streaming for long-running calls, and registry publication so external agents discover LiteDuck automatically.

**Offline / Local LLM Support**
Ollama as a first-class provider. Multi-provider config in `~/.LiteDuck/config.json` with per-agent model assignment and fallback chains. Fully air-gapped workflows where all inference runs locally.

### In-App Purchase

**iCloud Integration**
Sync workspace settings, agent profiles, and scrum configuration across devices via iCloud. Uses CloudKit key-value store for lightweight settings and CloudKit containers for larger assets. Automatic conflict resolution with last-writer-wins for settings and merge for agent memory. Requires active Apple ID sign-in; gracefully degrades when offline.

**Cloud Sync**
Real-time workspace synchronization beyond iCloud — supports custom cloud backends (S3, GCS, WebDAV) for teams not on Apple ecosystem. Selective sync: choose which workspace data directories (`.LiteDuck/scrum/`, `.LiteDuck/agents/`, `.LiteDuck/chat/`) participate. Differential sync with content-addressed chunks to minimize bandwidth. Encryption at rest with user-held keys.

**SSH Tunnel (Multi-Provider)**
Managed SSH tunnels with support for multiple providers: direct host, AWS SSM, GCP IAP, Azure Bastion, and Tailscale. Tunnel profiles stored in `~/.LiteDuck/tunnels/` with per-profile auth (key, certificate, or provider-specific token). Auto-reconnect with exponential backoff. Port forwarding UI for database access, remote APIs, and dev servers. Integrates with the existing SSH module for seamless terminal session handoff.

**Remote Controls**
Control LiteDuck from external devices — companion app, web dashboard, or API. Start/stop coding workflows, approve human-gate phases, view agent deliberations, and trigger builds remotely. Authenticated via device identity and biometric confirmation. Built on the existing companion API (`companion_api.rs`) and LAN transport, extended with optional cloud relay for access outside the local network.

### Platform

**Android Support**
Tauri v2 Android target. Basic layouts exist in `mobile/android/` (Kotlin Compose). Complete bridge integration to share the React frontend with iOS.

**Windows and Linux Polish**
First-class UX parity for Windows (MSI) and Linux (AppImage/deb). Remaining work: keyboard shortcuts (Cmd->Ctrl), native window chrome, font rendering, platform keychain integration.

---

## Future Horizons

Longer-term directions from the product vision — where LiteDuck is headed, not committed dates.

**Fleet Mode** — Treat related workspaces as a single coordinated fleet. Cross-workspace impact analysis, shared sprint boards, one AI council governing multiple repos.

**Collaborative Autonomy** — Shared agent councils for distributed teams. P2P LAN coordination with sprint boards that live in the repo and sync without a central server.

**Universal Impact Analysis** — Every modification triggers a dependency graph walk before it lands. Affected tests identified. Risk surfaced. No change is silent.

**Quality and Security Gates** — Runtime workflow gates: OWASP review, dependency audit, secret scanning — configurable per phase, with auto-fix before escalating to a human gate.

**Dynamic Customization** — Composable pipeline builder: add, remove, reorder workflow phases. Inject custom scripts, tools, or agents. Tune verbosity, risk tolerance, and consensus rules per workspace.

**Flexible LLM Providers** — Multi-provider with per-agent model assignment and fallback chains. Cost tracking surfaced before it becomes a surprise. Anthropic, OpenAI, Google, Ollama, Bedrock, Azure, and any compatible API.

---

## Shipped

### v2026.4.14 — Internal MCP, Dev Task Runner, Terminal Hardening

- **Internal MCP** — In-process service registry: 11 providers, 41 tools, pub/sub bus, external bridge on port 18790 for Claude Desktop/Cursor
- **Council ↔ Workflow bridge** — `dev_task_start` accepts `scrum_session_id`; per-story results written to `session.dev_executions` in real-time; auto-advance DevMode → Review on batch completion
- **AI Epic/Story generators** — Natural language to epics and stories via OpenClaw gateway
- **Dev Task runner** — Background AI story development with parallel execution, progress animation, stale lock auto-reset
- **Terminal MCP provider** — Session listing, creation, and command execution tools; publishes `terminal://sessions` on state changes
- **Terminal hardening** — PTY cleanup on shutdown, rename validation with rollback, session mapping sync, rapid-close race fix, SSH tab rename parity
- **Live DiscussionPanel** — Real-time agent deliberation display in AgentsCouncil PhaseContent
- **AgentsCouncil fixes** — Consensus->HumanApproval transition, session persistence across restarts, council profile loading
- **Settings migration** — config.json replaces deprecated SQLite for reads/writes
- **UI modernization** — Agent cards, StoryCard, KanbanColumn, dialog modals, landing page polish

### v2026.4.x — Platform Stability and Mobile

- **iOS Tauri app** — Native iOS build with edge-to-edge WebView and full feature parity
- **Mobile responsive layout** — Swipe gestures and haptic feedback throughout
- **watchOS companion** — Status glance and basic controls from the wrist
- **Dependency upgrades** — Vite 8, React 19.2, React Router 7.14, rusqlite 0.39, russh 0.60, git2 0.20
- **Release pipeline** — Quality gate, multi-platform builds, code signing, Homebrew auto-update

### v2026.3.x — Workflow and Agent Tooling

- **Coding Workflow** — AI multi-step plan generation with phase-by-phase execution and SQLite persistence
- **Skills Browser** — Browse and install OpenClaw skills from within the app
- **Plugin management UI** — Enable, disable, configure installed plugins
- **Doctor** — Gateway diagnostics with one-click auto-fix
- **Model switcher** — Switch AI model per session without leaving the workspace
- **Agent workspace selector** — Bind agents to a workspace directory for scoped context
- **Scrum board toggle** — Switch between local markdown files and Jira

### v2026.2.x — Developer Tooling and UX

- **Git worktrees** — Create and switch worktrees without leaving LiteDuck
- **Workspace quick switcher** — Keyboard-driven workspace jumping
- **Tmux terminal sessions** — Tab persistence backed by tmux, surviving app restarts
- **Ask AI multi-turn context** — Persistent conversation history with full context window
- **Splash screen** — Branded themed splash with fade-out on first load
- **React.lazy code splitting** — Route-level splitting for faster cold start

---

*The duck glides. The agents paddle furiously beneath. You watch, decide, and ship.*
