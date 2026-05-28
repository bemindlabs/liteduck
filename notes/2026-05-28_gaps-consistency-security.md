# Gap audit — consistency + security — 2026-05-28

Read-only audit of liteduck after the session that shipped the plugin system + VS
Code-style workspace shell and removed tmux / auto-updater / DMG releases (now
build-from-source Homebrew formula). Method: grep + read only — no edits, no build,
no app run. Risk-tagged P0 (real risk or false doc claim) / P1 / P2.

## Summary

- **No real secrets committed.** Bundled `jira/auth.toml` is placeholders-only; the
  only token-shaped grep hit is a fake `ghp_xyz` test fixture.
- **Plugin sandbox is "user-trust v1" as documented** — `sh -c` subprocesses with
  full user privileges; `network`/`paths` declared but NOT OS-enforced. Deny-list,
  host-lock, and path-traversal guards are all correctly enforced before disk write.
- **Two false "kept" doc claims (P0):** CHANGELOG says Git stage/commit/push and tmux
  sessions are kept — both are gone (git.rs is read-only; tmux removed).
- **`bash_validator.rs` is dead code** — never wired into the terminal path, so the
  ROADMAP "harden the validator" item is moot until it is actually invoked.
- **Versions all agree on `2026.5.2`** (package.json, Cargo.toml, tauri.conf.json,
  git tag `v2026.5.2`, Homebrew formula). One config drift: `dmg` still a bundle target.

## Consistency gaps

### P0 — false doc claims (code does not back them)

- **CHANGELOG.md:50** — `[2026.5.2]` "Kept" lists Git "stage/unstage,
  **commit/push/discard**, worktrees". Code is read-only: `git.rs` exposes only
  `git_status/log/diff*/current_branch/list_branches/worktree_*/init/scan_repos`
  (`lib.rs:226-239`); the only writer is `git_init` (`git.rs:632`). No
  `git_add/git_reset/git_commit/git_discard_file` exist. Frontend `src/lib/git.ts`
  has no write wrapper either. This is the same false-claim class as the ROADMAP-git
  gap, and is internally contradicted by **LITEDUCK-8 (Writable git IPC) = `backlog`**.
- **CHANGELOG.md:49** — `[2026.5.2]` "Kept" lists "Integrated terminal — PTY, tabs,
  split panes, **tmux sessions**". tmux was removed (LITEDUCK-6 `done`; CHANGELOG's
  own `[Unreleased]` heritage notes the removal). Self-contradictory within the file.

### P1 — stale home-dir naming (PascalCase / LoopDuck vs lowercase `.liteduck`)

Code uses **`~/.liteduck`** (lowercase) with a one-time migration from legacy
`~/.LiteDuck` (`home.rs:5,328-346,449`). Several docs still say PascalCase or LoopDuck:

- **docs/adr-001-single-direction.md:87** — "the on-disk data directory is **still
  named `.LoopDuck` in some builds**". Code never uses `.LoopDuck` for the home dir
  (only the orphan Cargo.lock referenced bemind-loopduck). Outright wrong.
- **docs/adr-001-single-direction.md:80-81** — "`~/.LiteDuck` + `<workspace>/.LiteDuck`".
  Also wrong on the per-workspace claim: `CLAUDE.md:123` and `home.rs` say storage is
  **global only** — "no per-workspace data directory."
- **CHANGELOG.md:51** — `[2026.5.2]` Settings line: "JSON config (`~/.LiteDuck` +
  workspace `.LiteDuck`)". Same PascalCase + per-workspace drift.
- **settings.rs:282** (doc-comment) — references `~/.LiteDuck/config.json`.

### P1 — CHANGELOG `[Unreleased]` is incomplete for this session

`[Unreleased]` (CHANGELOG.md:17-68) logs only the distribution change
(Homebrew-from-source, updater/DMG/CI removal) and the LoopDuck refocus. It does **not**
log the two headline features this session shipped: the **plugin system**
(LITEDUCK-15/16/17, `plugins.rs`, `PluginsPanel.tsx`) and the **VS Code-style
workspace shell** (LITEDUCK-1, `src/components/workspace/`). README/ROADMAP/CLAUDE.md
all document both; the CHANGELOG omits them.

### P2 — config drift

- **tauri.conf.json:31** — `"targets": ["app", "dmg"]` still lists `dmg`, but the
  Homebrew formula builds `--bundles app` (`liteduck.rb:33`) and every doc says
  "no prebuilt DMG" (README:38, ROADMAP:141, liteduck.rb:5, CHANGELOG[Unreleased]:22).
  `dmg` is now dead config; drop it to `["app"]` to match the source-only story.

### Version consistency — PASS

All five agree on `2026.5.2`: package.json:4, Cargo.toml:3, tauri.conf.json:4, git tag
`v2026.5.2`, HomebrewFormula/liteduck.rb:17-18 (`url` tag + `version`). README install
snippet, ROADMAP "Latest release" all consistent. (Caveat: the formula's `sha256`
`4dbcd6c8…` cannot be verified offline against the actual tag tarball — flag for
release-time check, not a defect.)

### Scrum ↔ reality — mostly consistent

LITEDUCK-1..21 (21 items). Spot-check against code:
- `done` and real: LITEDUCK-1 (workspace shell — `src/components/workspace/`),
  -6 (tmux removed — confirmed gone), -7 (MAS removed), -15/16/17 (plugins —
  `plugins.rs` + bundled jira/bwoc), -18/19 (terminal dock — `pty.rs`/`terminal.rs`).
- `backlog` and genuinely not shipped: LITEDUCK-8 (writable git — confirmed absent),
  -3 (Monaco/CodeMirror — still FilePreview), -9..13 (git UX/perf).
- No "shipped but untracked" feature found. **One mismatch:** CHANGELOG claims git
  write + tmux as shipped (see P0 above) while the board correctly has LITEDUCK-8 as
  `backlog` and LITEDUCK-6 as a completed removal — so the board is right and the
  CHANGELOG is the stale artifact.

## Security posture

### Plugin system (`src-tauri/src/plugins.rs`) — characterization

**Sandbox = user-trust v1, as documented (accept, but state the residual risk).**
- `run_command_inner` (plugins.rs:564-607) spawns the manifest `run` string via
  `sh -c` with `current_dir = plugin dir` and the user's **full privileges**. The host
  loads no plugin code in-process. **`network` and `paths` are declared in the manifest
  and surfaced in the install UI (`PluginsPanel.tsx:306-328,482`) but are NOT enforced**
  — a `tool`-kind plugin can read/write anywhere the user can and reach any host. This
  matches the documented v1 boundary (CLAUDE.md:117-119, plugins.rs:22-26). **P1 residual
  risk:** any installed plugin = arbitrary code execution at user privilege; the only gate
  is the user's install-time consent. A real OS sandbox is the right future phase.
- **Injection-safe param passing — good.** User params are exported as
  `LITEDUCK_PARAM_<KEY>` env vars (uppercased, non-alnum → `_`), never interpolated into
  the shell string (plugins.rs:587-596). Test `run_command_passes_params_as_env`
  (plugins.rs:771) covers it. Note: the `run` *template itself* is attacker-controlled by
  the plugin author — but that is the trust model, not an injection bug.

**Scope-ceiling deny-list (chat/agent/llm) — enforced before disk write on BOTH paths. Good.**
- Folder install: `install_plugin_inner` calls `load_manifest` → `validate_manifest`
  **before** any `copy_dir_recursive` (plugins.rs:280 then 290). Comment at :279 is
  accurate.
- Registry install: `install_from_registry_inner` fetches `plugin.json`, parses, and runs
  `validate_manifest` at plugins.rs:502 **before** the staging download (:521) and atomic
  move (:536). Deny-list is the first check inside `validate_manifest` (:185). Tests
  `denied_kind_is_refused`, `list_skips_denied_and_invalid`,
  `manifest_gate_refuses_denied_kind_from_fetched_bytes` cover it.

**Registry egress host-lock — enforced. Good.**
- `ALLOWED_HOSTS = ["raw.githubusercontent.com","api.github.com"]` (plugins.rs:119).
  `assert_allowed_host` is called on the registry URL (:345), Contents API URL (:371), and
  every `download_url` (:392) — and redirects are disabled (`Policy::none()`, :307) so a
  host cannot bounce egress elsewhere. Look-alike `raw.githubusercontent.com.evil.com` is
  rejected (test at :843). Tight.

**Path traversal — guarded on registry + uninstall; folder-install relies on manifest id.**
- `validate_manifest` rejects ids containing `/`, `\`, or `..` (plugins.rs:207-212).
- `install_from_registry_inner` guards `plugin_id` early (:463-469) and re-checks the
  manifest id matches (:505).
- `uninstall_plugin_inner` guards the id (:549).
- **`plugin_install(path)` (folder) does NOT validate the `path` argument for traversal**
  — but the destination dir is derived from the **validated manifest id**, never the
  source path (:282-290), so a hostile `path` can only read an arbitrary source dir the
  user already chose via the OS dialog; it cannot write outside `~/.liteduck/plugins/<id>/`.
  **P2** — low real risk (write target is id-derived), worth a one-line note that source
  path is intentionally unconstrained because the user picks it.

### Shell-command validator (`bash_validator.rs`)

- **Current state: classifies + blocks by FIRST command, does NOT block injection
  metacharacters.** `extract_first_command` (used by `validate_read_only`,
  `validate_sed`, `classify_command`) strips pipelines/chains and inspects only the head.
  There is **no detection of `$()`, backticks, `;`, `&&`, `||`, `|`** as injection vectors
  (grep for those operators in the file returns only unrelated matches). So `cat x &&
  rm -rf ~` passes read-only validation because the first command is `cat`. ROADMAP:78-79
  correctly lists hardening this as **planned** — confirmed not yet done.
- **P1 — the module is DEAD CODE.** `bash_validator` is only declared in `lib.rs:6`
  (`pub mod bash_validator;`) and is **not in either `generate_handler!` block** and not
  invoked by `terminal.rs`/`pty.rs`. The terminal is a raw PTY with no validation gate, so
  hardening the validator has zero effect until it is actually wired into the command path
  (or the module should be removed to avoid implying a protection that does not exist).

### Secrets

- **Clean.** `src-tauri/resources/plugins/jira/auth.toml` is placeholders-only
  (`email/token/base_url = ""`) with an explicit "NEVER COMMIT REAL CREDENTIALS" header
  and documents resolution via `JIRA_*` env vars or a chmod-600 user-home copy.
- Repo-wide grep (`ghp_`, `github_pat_`, `xox*`, `AKIA…`, `BEGIN … PRIVATE KEY`, token
  assignments) found **only one hit**: `src/lib/settings.test.ts:153`
  (`github_token: "ghp_xyz"`) — a synthetic test fixture, not a real credential.

### Dependencies (post orphan-lock cleanup + rustls-webpki bump)

Verified against the live workspace `Cargo.lock`:
- **`src-tauri/Cargo.lock` is DELETED** — the orphan loopduck lock is gone, so the ~22
  stale alerts (russh/openssl/jsonwebtoken families) are retired as "no longer present".
  This matches the triage note's Phase-0 recommendation.
- **rustls-webpki = `0.103.13`** in `Cargo.lock` — bumped; closes the single live HIGH
  (#11) + the two lows (#7/#8).
- **Still live after this session:**
  - **`tauri 2.10.3`** (Cargo.lock) — **NOT bumped to ≥2.11.1.** The Origin-Confusion
    advisory (GHSA-7gmj-67g7-phm9 / CVE-2026-42184, MODERATE, direct dep, alert #12) is
    **still open.** This is the most operationally serious live finding: LiteDuck ships
    local-only IPC commands (`files.rs`, `git.rs`, `terminal.rs`, `plugins.rs`) that a
    confused remote origin could invoke. **P1 — `cargo update -p tauri`.**
  - **`glib 0.18.5`** (Cargo.lock) — VariantStrIter unsoundness (GHSA-wrw7-89jp-8q8g,
    MODERATE, transitive via tao/wry). Linux-only path; LiteDuck is macOS-first → **P2,
    wait-and-watch** on upstream wry/tao.
  - **`rand 0.7.3` and `rand 0.9.2`** (Cargo.lock) — soundness lows
    (GHSA-cq8v-f236-94qc, #9/#10). Not exploitable in normal use. **P2** —
    `cargo update -p rand` if parents allow.
- `.github/dependabot.yml` still **absent** (matches the triage open question) — no
  automated patch PRs.

## Stale references (still pointing at removed features)

| Where | Line | Stale claim | Reality |
|---|---|---|---|
| CHANGELOG.md | 49 | terminal "tmux sessions" kept | tmux removed (LITEDUCK-6) |
| CHANGELOG.md | 50 | Git "commit/push/discard" kept | git.rs read-only; LITEDUCK-8 backlog |
| CHANGELOG.md | 51 | config at `~/.LiteDuck` + workspace `.LiteDuck` | code uses `~/.liteduck`, global only |
| docs/adr-001 | 87 | data dir "still named `.LoopDuck`" | code uses `~/.liteduck` (no `.LoopDuck`) |
| docs/adr-001 | 80-81 | `~/.LiteDuck` + `<workspace>/.LiteDuck` | lowercase + global only |
| settings.rs | 282 | doc-comment `~/.LiteDuck/config.json` | `~/.liteduck/config.json` |
| tauri.conf.json | 31 | `dmg` bundle target | source-only; formula builds `app` only |
| bash_validator.rs | (whole) | implies terminal command validation | module is dead code, not wired |

Healthy: README, ROADMAP, CLAUDE.md, VISION, and CI workflows (`ci.yml`/`regression.yml`)
carry no live references to tmux/updater/DMG/MAS/liteduck-releases as current — they only
appear in correct past-tense / heritage / removal-log context. The `LoopDuck` mentions in
ROADMAP:148, VISION, ADR-001, plugins.rs:44 are all intentional heritage/charter framing.
