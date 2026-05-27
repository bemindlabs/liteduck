# Releasing LiteDuck

LiteDuck ships via an **automated release pipeline**. You release by bumping the
version — there is no manual tagging step. This document describes the end-to-end
flow and the secrets it depends on.

> **Scope:** macOS only (Apple Silicon + Intel). Windows and Linux build jobs are
> deferred; the pipeline is structured to add them later without reworking the flow.

---

## TL;DR — how to cut a release

1. Bump the version in **all three** files to the same value (CalVer, `YYYY.M.D`):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
2. (Recommended) Move the `## [Unreleased]` notes in `CHANGELOG.md` under a new
   `## [<version>] - <date>` heading.
3. Merge to `main`.

That's it. The push to `main` is detected, the tag `v<version>` is created and
pushed for you, and the full build → sign → notarize → publish → mirror →
Homebrew pipeline runs automatically.

You can also trigger the tagging step manually from the **Actions** tab
(**Auto Release → Run workflow**) — useful for re-running after fixing a
version mismatch.

---

## The two workflows

### 1. `.github/workflows/auto-release.yml` — Auto Release (the new trigger)

- **Fires on:** a push to `main` that changes `package.json`, or `workflow_dispatch`.
- **Reads** the version from `package.json`.
- **Verifies** that `package.json`, `src-tauri/tauri.conf.json`, and
  `src-tauri/Cargo.toml` all carry the same version — fails loudly otherwise.
- **Tags:** if `v<version>` does **not** already exist (checked locally *and* on
  origin), it creates an annotated tag and pushes it. If the tag already exists,
  the job exits cleanly — the workflow is **idempotent**, so re-runs and
  no-op `package.json` edits are safe.

**Why a PAT (`RELEASE_PAT`) and not the default token:** GitHub intentionally does
**not** re-trigger workflows for events created by the built-in `GITHUB_TOKEN`. A
tag pushed with `GITHUB_TOKEN` would sit there inert and `release.yml` would never
run. So `auto-release.yml` checks out the repo with `RELEASE_PAT` and pushes the
tag under that identity — which **does** trigger `release.yml`.

### 2. `.github/workflows/release.yml` — Release (the existing build pipeline)

Fires on `push: tags: v*` — i.e. the tag that Auto Release just pushed. Jobs run
in sequence:

1. **quality-gate** — `tsc` / format / lint / vitest+coverage / Rust, and re-checks
   that the tag version matches the three config files.
2. **build** (macOS matrix: `aarch64-apple-darwin` + `x86_64-apple-darwin`) —
   builds with `tauri-action`, imports the Developer ID cert, signs, and notarizes
   each `.dmg`; creates a **draft** GitHub Release in `bemindlabs/liteduck` with the
   `.dmg`s, updater tarballs, and `latest.json`.
3. **publish** — flips the draft to a published release. Release notes are
   **auto-generated** (`generate_release_notes: true`) from merged PRs/commits
   since the previous tag; the body also links to the full `CHANGELOG.md`.
4. **public-release** — downloads the assets from `bemindlabs/liteduck` and mirrors
   them to the public `bemindlabs/liteduck-releases` repo.
5. **update-homebrew** — downloads both arch DMGs from `liteduck-releases`, computes
   SHA-256s, and updates the cask in `bemindlabs/homebrew-liteduck`.

---

## Flow at a glance

```
bump version in package.json/tauri.conf.json/Cargo.toml
        │  merge to main
        ▼
auto-release.yml  (verify versions match → push tag v<version> via RELEASE_PAT)
        │  tag push triggers ▼
release.yml
   quality-gate → build (sign + notarize, macOS x2) → publish (draft → live)
        → public-release (mirror to liteduck-releases) → update-homebrew
```

---

## Required secrets

Configure these in **Settings → Secrets and variables → Actions** of the
`bemindlabs/liteduck` repository.

| Secret | Used by | Purpose |
|---|---|---|
| `RELEASE_PAT` | auto-release.yml | Fine-grained/classic PAT used to **push the tag** so that `release.yml` is triggered (the default `GITHUB_TOKEN` cannot trigger downstream workflows). Needs `contents: write` on `bemindlabs/liteduck`. |
| `PUBLIC_RELEASE_TOKEN` | release.yml (public-release, update-homebrew) | PAT with `contents: write` on **both** `bemindlabs/liteduck-releases` and `bemindlabs/homebrew-liteduck`, used to create the public release and push the cask update. |
| `APPLE_CERTIFICATE` | release.yml (build) | Base64-encoded Developer ID Application `.p12` certificate. |
| `APPLE_CERTIFICATE_PASSWORD` | release.yml (build) | Password for the `.p12`. |
| `APPLE_SIGNING_IDENTITY` | release.yml (build) | e.g. `Developer ID Application: Pituk Kaewsuksai (944QFC9G5N)`. |
| `KEYCHAIN_PASSWORD` | release.yml (build) | Arbitrary password for the ephemeral CI keychain. |
| `APPLE_ID` | release.yml (build) | Apple ID email used for notarization. |
| `APPLE_ID_PASSWORD` | release.yml (build) | App-specific password (not the Apple ID account password). |
| `APPLE_TEAM_ID` | release.yml (build) | Apple Developer Team ID, e.g. `944QFC9G5N`. |

`GITHUB_TOKEN` is provided automatically by Actions and needs no setup.

### Minting `RELEASE_PAT`

Use a token tied to an account/bot with push access to `bemindlabs/liteduck`:

- **Fine-grained PAT (recommended):** repository access = `bemindlabs/liteduck`,
  permission **Contents: Read and write**.
- **Classic PAT:** scope `repo`.

Store it as the `RELEASE_PAT` secret. Set an expiry reminder — when it expires,
Auto Release will fail at the tag-push step until it's rotated.

### Notes on the Apple secrets

The signing/notarization steps are **conditional**: if `APPLE_CERTIFICATE` /
`APPLE_ID` are not set, the build proceeds **unsigned** and skips notarization
rather than failing. For a real public macOS release, all five Apple secrets must
be present so Gatekeeper accepts the app.

---

## Troubleshooting

- **Pushed a version bump but no release ran.** Check that `RELEASE_PAT` exists and
  is not expired — without it the tag push can't trigger `release.yml`. Confirm the
  push actually changed `package.json` (the trigger is path-filtered).
- **Auto Release failed on "Version mismatch".** The three version fields disagree.
  Align `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`,
  then re-run (push again or use **Run workflow**).
- **Tag already exists.** Auto Release skips cleanly. To re-release, bump to a new
  version; deleting and re-pushing a tag is discouraged.
- **`release.yml` failed at public-release / update-homebrew.** Usually a
  `PUBLIC_RELEASE_TOKEN` scope problem — it must have write access to both
  `liteduck-releases` and `homebrew-liteduck`.
