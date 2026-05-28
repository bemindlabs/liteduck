# Dependabot triage — 2026-05-28

Read-only triage of GitHub's 28 open Dependabot alerts on `bemindlabs/liteduck@main`.
Data source: `gh api repos/bemindlabs/liteduck/dependabot/alerts --paginate` (kla-bemindlabs).
Cross-referenced against `Cargo.lock`, `src-tauri/Cargo.lock`, `package.json`, `package-lock.json`, and `npm audit`.

## Summary

- GitHub totals match the report banner: **10 high / 8 moderate / 10 low = 28 open** (plus 5 already-fixed npm alerts not counted here).
- Ecosystem split: **0 npm open** (all 5 mermaid+brace-expansion alerts state=`fixed` after the recent bump to `mermaid ^11.14.0`); **28 rust open**.
- **Critical context — stale lockfile.** The repo has TWO Cargo lockfiles:
  - `Cargo.lock` (workspace root, 635 packages) — the **actual** build lock for the current `[workspace] members = ["src-tauri", "crates/liteduck-core"]`.
  - `src-tauri/Cargo.lock` (733 packages) — a leftover lock from **`bemind-loopduck 2026.4.6`** (LiteDuck's parent project), containing `russh`, `openssl`, `jsonwebtoken`, `octocrab`, `bollard`, `btleplug`, etc. None of those crates are in the current `src-tauri/Cargo.toml`. **22 of the 28 open alerts (incl. all 7 high-sev openssl + russh CVEs) come from this orphan lockfile.**
  - **Recommended quick win: delete `src-tauri/Cargo.lock`** — Cargo only reads the workspace-root lock for workspace members. This single action retires ~22 alerts as "no longer present".
- After lockfile pruning, the **real** open exposure is **5 distinct advisories / 6 alerts** in the active workspace lock:
  - tauri 2.10.3 → 2.11.1 (medium, direct dep)
  - rustls-webpki 0.103.10 → 0.103.13 (1 high + 2 low, transitive via reqwest/rustls)
  - rand 0.7.3 → 0.8.6 (low, transitive)
  - rand 0.9.2 → 0.9.3 (low, transitive)
  - glib 0.18.5 → 0.20.0 (medium, transitive via tao/wry → tauri)
  - git2 in `src-tauri/Cargo.lock` is `0.19.0` (low), but the workspace `Cargo.lock` already has `git2 0.20.4` (fixed). Another stale-lock artifact.

| Bucket | Count | Notes |
|---|---|---|
| Direct dep, patch update available | **1** | `tauri 2.10.3 → 2.11.1` (declared as `tauri = { version = "2", ... }` — semver-compatible bump) |
| Transitive, fix exists upstream and is reachable via `cargo update` | **5 advisories** | rustls-webpki, rand×2, glib (parent crates already permit the patched range) |
| Stale-lock artifacts (no live exposure) | **~22 alerts** | russh family, openssl family, jsonwebtoken, glib copy, rand copies, rustls-webpki copy, git2 copy — all in `src-tauri/Cargo.lock` |
| Already fixed in repo (state=fixed) | 5 npm | mermaid×4, brace-expansion×1 |

## High-severity (10)

All 10 highs are in `src-tauri/Cargo.lock` only (the orphan loopduck lock). **The most urgent live high is `rustls-webpki` (alert #11)**, which is the only one that also appears in the active workspace lock.

| # | GHSA | Package | Current → Fixed | Lock | Live? | 1-line summary | Action |
|---|---|---|---|---|---|---|---|
| 33 | GHSA-g9f8-wqj9-fjw5 | russh | ≤ 0.60.2 → 0.60.3 | src-tauri/Cargo.lock | No (loopduck) | Unchecked CryptoVec growth reachable from local SSH agent inputs (CVE-2026-46673) | Delete orphan lock; russh is not a liteduck dep |
| 32 | GHSA-g9f8-wqj9-fjw5 | russh-cryptovec | ≤ 0.60.2 → 0.60.3 | src-tauri/Cargo.lock | No | Same advisory as #33 | Same — delete orphan lock |
| 28 | GHSA-xp3w-r5p5-63rr | openssl | 0.9.7–0.10.78 → 0.10.79 | src-tauri/Cargo.lock | No | UB in `X509Ref::ocsp_responders` with non-UTF-8 OCSP URLs (CVE-2026-42327) | Delete orphan lock; rust-openssl is not used (we use rustls + aws-lc-rs) |
| 27 | GHSA-82j2-j2ch-gfr8 | rustls-webpki | < 0.103.13 → 0.103.13 | src-tauri/Cargo.lock | **Yes — also alert #11** | DoS via panic on malformed CRL BIT STRING | **`cargo update -p rustls-webpki`** |
| 26 | GHSA-f5v4-2wr6-hqmg | russh | < 0.60.1 → 0.60.1 | src-tauri/Cargo.lock | No | Pre-auth DoS via unbounded allocation in keyboard-interactive auth (CVE-2026-42189) | Delete orphan lock |
| 25 | GHSA-pqf5-4pqq-29f5 | openssl | 0.9.27–0.10.78 → 0.10.78 | src-tauri/Cargo.lock | No | `Deriver::derive` short-buffer overflow on OpenSSL 1.1.1 (CVE-2026-41676) | Delete orphan lock |
| 23 | GHSA-8c75-8mhr-p7r9 | openssl | 0.10.24–0.10.78 → 0.10.78 | src-tauri/Cargo.lock | No | Incorrect bounds assertion in AES key wrap (CVE-2026-41678) | Delete orphan lock |
| 22 | GHSA-ghm9-cr32-g9qj | openssl | 0.10.39–0.10.78 → 0.10.78 | src-tauri/Cargo.lock | No | `MdCtxRef::digest_final()` writes past caller buffer (CVE-2026-41681) | Delete orphan lock |
| 21 | GHSA-hppc-g8h3-xhp3 | openssl | 0.9.24–0.10.78 → 0.10.78 | src-tauri/Cargo.lock | No | Unchecked callback length in PSK/cookie trampolines leaks adjacent memory (CVE-2026-41898) | Delete orphan lock |
| 11 | GHSA-82j2-j2ch-gfr8 | rustls-webpki | < 0.103.13 → 0.103.13 | **Cargo.lock (live)** | **Yes** | DoS via panic on malformed CRL BIT STRING | **`cargo update -p rustls-webpki` — single live high** |

**Single most urgent live vuln:** `rustls-webpki 0.103.10` (alert #11). Reqwest+rustls is on the live request path (Tauri updater, possibly user-triggered HTTP); a malformed CRL could panic the worker thread.

## Moderate-severity (8)

| # | GHSA | Package | Current → Fixed | Lock | Live? | Summary |
|---|---|---|---|---|---|---|
| 31 | GHSA-phqj-4mhp-q6mq | openssl | 0.10.50–0.10.79 → 0.10.80 | src-tauri | No | OOB write in `cipher_update_inplace` for AES-KW-PAD (CVE-2026-45784) — stale lock only |
| 30 | GHSA-xv59-967r-8726 | openssl | 0.10.0–0.10.78 → 0.10.79 | src-tauri | No | Heap overflow encrypting with AES key-wrap-with-padding (CVE-2026-44662) — stale lock only |
| 29 | GHSA-7gmj-67g7-phm9 | tauri | 2.0.0–2.11.0 → 2.11.1 | src-tauri | No | Origin Confusion — remote pages invoke local-only IPC (CVE-2026-42184) — stale-lock copy |
| 15 | GHSA-h395-gr6q-cpjc | jsonwebtoken | < 10.3.0 → 10.3.0 | src-tauri | No | Type Confusion → potential authz bypass (CVE-2026-25537) — stale lock |
| 14 | GHSA-h5rc-j5f5-3gcm | russh | < 0.54.1 → 0.54.1 | src-tauri | No | Missing overflow checks during channel window adjust (CVE-2025-54804) — stale lock |
| 13 | GHSA-wrw7-89jp-8q8g | glib | 0.15.0–0.20.0 → 0.20.0 | src-tauri | No (live copy is #6) | Unsoundness in `VariantStrIter` iterator impls |
| 12 | **GHSA-7gmj-67g7-phm9** | **tauri** | **2.0.0–2.11.0 → 2.11.1** | **Cargo.lock (live)** | **Yes — direct dep** | **Origin Confusion: remote pages can invoke local-only IPC commands** |
| 6 | GHSA-wrw7-89jp-8q8g | glib | 0.15.0–0.20.0 → 0.20.0 | **Cargo.lock (live)** | **Yes (transitive via tao/wry)** | Unsoundness in `glib::VariantStrIter` iterators — affects Linux only (gtk-rs path) |

**Live moderates after lockfile cleanup:** 2 — `tauri` (the only direct dep on the list; trivial bump) and `glib` (transitive, Linux build path only — LiteDuck ships macOS first; risk is low on the current target platform but still wants the fix).

## Low-severity (10)

| # | GHSA | Package | Current → Fixed | Lock | Live? |
|---|---|---|---|---|---|
| 24 | GHSA-xmgf-hq76-4vx2 | openssl | 0.9.0–0.10.78 → 0.10.78 | src-tauri | No |
| 20 | GHSA-cq8v-f236-94qc | rand | 0.7.0–0.8.6 → 0.8.6 | src-tauri | No (live copy is #10) |
| 19 | GHSA-cq8v-f236-94qc | rand | 0.9.0–0.9.3 → 0.9.3 | src-tauri | No (live copy is #9) |
| 18 | GHSA-xgp8-3hg3-c2mh | rustls-webpki | 0.101.0–0.103.12 → 0.103.12 | src-tauri | No (live copy is #8) |
| 17 | GHSA-965h-392x-2mh5 | rustls-webpki | 0.101.0–0.103.12 → 0.103.12 | src-tauri | No (live copy is #7) |
| 16 | GHSA-j39j-6gw9-jw6h | git2 | < 0.20.4 → 0.20.4 | src-tauri | **No — workspace already has 0.20.4** |
| 10 | GHSA-cq8v-f236-94qc | rand | 0.7.0–0.8.6 → 0.8.6 | Cargo.lock | **Yes** (transitive) |
| 9  | GHSA-cq8v-f236-94qc | rand | 0.9.0–0.9.3 → 0.9.3 | Cargo.lock | **Yes** (transitive) |
| 8  | GHSA-xgp8-3hg3-c2mh | rustls-webpki | 0.101.0–0.103.12 → 0.103.12 | Cargo.lock | **Yes** (transitive) |
| 7  | GHSA-965h-392x-2mh5 | rustls-webpki | 0.101.0–0.103.12 → 0.103.12 | Cargo.lock | **Yes** (transitive) |

The two `rand` lows are well-known soundness issues (custom-logger interaction with `rand::rng()`); not exploitable in normal use. The two rustls-webpki lows are subsumed by the high (#11) — bumping to `0.103.13` covers them all.

## Recommended action plan

Phased, smallest blast radius first. **All steps are read-only proposals; the operator should run them.**

### Phase 0 — Verify and prune (no dep changes; biggest win)

1. **Verify** the workspace lock is the only one Cargo reads:
   ```bash
   cd projects/liteduck && cargo metadata --format-version 1 --no-deps | jq '.workspace_root, .workspace_members'
   ```
   Expected: `workspace_root` is the project root; members are `src-tauri` and `liteduck-core`.
2. **Remove the orphan `src-tauri/Cargo.lock`** (it belongs to bemind-loopduck, not liteduck):
   ```bash
   git rm src-tauri/Cargo.lock
   ```
   This single change should auto-close ~22 Dependabot alerts on the next push (russh family, openssl family, jsonwebtoken, plus the duplicate copies of tauri/glib/rand/rustls-webpki/git2).

### Phase 1 — Quick wins (live alerts, semver-compatible)

3. **Bump tauri to ≥ 2.11.1** (declared as `"2"` in `src-tauri/Cargo.toml`; Cargo just needs a refresh):
   ```bash
   cd src-tauri && cargo update -p tauri
   ```
   Closes alert #12 (medium, **the only live high/medium direct-dep vuln**). Origin Confusion in Tauri IPC is the most operationally serious of the live findings — LiteDuck ships local IPC commands (`files.rs`, `git.rs`, `terminal.rs`); the fix should be prioritized.
4. **Bump rustls-webpki to ≥ 0.103.13** (transitive, but `cargo update` resolves within current range constraints):
   ```bash
   cargo update -p rustls-webpki
   ```
   Closes #11 (high), #7, #8 (lows).
5. **Bump rand transitively:**
   ```bash
   cargo update -p rand
   ```
   Closes #9, #10 (lows). If a parent crate pins an older `rand`, this is a no-op — accept as wait-and-watch.

### Phase 2 — Override / patch (only if a parent crate pins an old version)

6. If `cargo update -p rustls-webpki` doesn't move the lock (because reqwest/rustls pin an older minor), add a `[patch.crates-io]` entry in the workspace root `Cargo.toml`:
   ```toml
   [patch.crates-io]
   rustls-webpki = { version = "0.103.13" }
   ```
   Same pattern if rand resists.

### Phase 3 — Wait and watch

7. **glib 0.18.5 → 0.20.0** (alert #6, medium): the parent chain is `tauri → wry → tao → glib`. Upgrading glib needs tao/wry to bump first. Track upstream wry releases. Risk: Linux-only soundness bug in iterator impls; LiteDuck is macOS-first and doesn't currently ship Linux builds — accept as low-priority.

## Cargo notes

`cargo-audit` is **not installed** on this machine. To run a local audit (read-only):
```bash
cargo install cargo-audit && cd projects/liteduck && cargo audit
```
This would emit RUSTSEC IDs (e.g. `RUSTSEC-2024-xxxx` for the rand soundness issues) that map 1:1 to the GHSAs above. Skipped here per the constraint "do not run install/update".

`npm audit` (no install needed) reports **0 vulnerabilities** in `package-lock.json` — confirms the 5 closed mermaid/brace-expansion alerts are fully drained.

## Open questions

- **Dependabot auto-PRs** — `.github/dependabot.yml` is **not present** in the repo (verified by absence in `.github/`). Enabling it would auto-open patch-bump PRs for the transitive lows (`cargo update -p <pkg>` cases) and the npm side. Pros: hands-off security hygiene. Cons: noisy PRs for every transitive bump, especially on the Tauri/wry dep tree. Recommendation: enable for `npm` ecosystem (low PR volume, fast review) and for `cargo` with `versioning-strategy: lockfile-only` to only get lockfile bumps without churning `Cargo.toml`.
- **Should we pin tauri to a minor (`= "2.11"`)** to avoid surprise major-line behavior changes? The Origin Confusion fix landed in `2.11.1`; pinning `~2.11` keeps us on the secure line without auto-jumping to a future `2.12` that may change IPC semantics again.
- **Does loopduck still ship?** If `bemind-loopduck` is no longer maintained, the orphan `src-tauri/Cargo.lock` should be removed permanently. If it IS maintained (separate repo), the same vulns need to be triaged there — out of scope for this note.
- **Is the upstream parent (bemind-loopduck) on GitHub?** If yes, it owns 7 of the 10 high-sev openssl/russh fixes for its own builds; consider opening tracking issues there.

## Appendix — alert manifest_path breakdown (open alerts)

```
src-tauri/Cargo.lock : 22 alerts (orphan loopduck lock)
Cargo.lock           :  6 alerts (live workspace lock)
                       = tauri (medium), rustls-webpki (high+2 low), rand×2 (low), glib (medium)
```
