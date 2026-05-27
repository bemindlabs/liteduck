# Homebrew Cask — LiteDuck

How LiteDuck is distributed through Homebrew, how to create/publish the tap the
first time, and how to bump the cask on every release.

End users install with:

```bash
brew install --cask bemindlabs/liteduck/liteduck
```

That shorthand resolves to the tap repository **`bemindlabs/homebrew-liteduck`**
(Homebrew strips the `homebrew-` prefix) and the cask file `Casks/liteduck.rb`
inside it. The DMG artifacts it downloads live in the public releases repo
**`bemindlabs/liteduck-releases`**.

## Moving parts

| Thing | Where | Role |
|---|---|---|
| Cask source of truth | this repo → [`HomebrewFormula/liteduck.rb`](../HomebrewFormula/liteduck.rb) | Reviewed copy, kept in version control next to the app |
| Published cask | `bemindlabs/homebrew-liteduck` → `Casks/liteduck.rb` | What `brew` actually reads |
| Release artifacts | `bemindlabs/liteduck-releases` → release `v<version>` | The `.dmg` files the cask downloads |
| Release automation | this repo → [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Builds, publishes, mirrors, and bumps the cask on tag push |

The cask carries **two** download URLs — one per macOS architecture — using the
DMG names produced by the Tauri build:

- Apple Silicon: `LiteDuck_<version>_aarch64.dmg`
- Intel: `LiteDuck_<version>_x64.dmg`

Both point at the versioned release tag, e.g.
`https://github.com/bemindlabs/liteduck-releases/releases/download/v2026.5.2/LiteDuck_2026.5.2_aarch64.dmg`.

## One-time: create and publish the tap

> Do this once. The `update-homebrew` job in `release.yml` assumes the tap
> repo already exists and that `Casks/liteduck.rb` is present so it can be
> overwritten on each release.

1. **Create the GitHub repo** `bemindlabs/homebrew-liteduck` (public). The
   `homebrew-` prefix is required — `brew tap bemindlabs/liteduck` looks for it.

2. **Lay out the tap:**

   ```bash
   git clone https://github.com/bemindlabs/homebrew-liteduck.git
   cd homebrew-liteduck
   mkdir -p Casks
   # Seed the published cask from this repo's source-of-truth copy:
   cp /path/to/liteduck/HomebrewFormula/liteduck.rb Casks/liteduck.rb
   ```

3. **Fill in real checksums** (the source copy ships zero-placeholders on
   purpose — see "Checksums" below), then validate:

   ```bash
   brew audit --cask --new Casks/liteduck.rb
   brew style Casks/liteduck.rb
   ```

4. **Commit and push:**

   ```bash
   git add Casks/liteduck.rb
   git commit -m "Add LiteDuck cask"
   git push origin main
   ```

5. **Smoke-test the end-user path** on a machine without the app installed:

   ```bash
   brew install --cask bemindlabs/liteduck/liteduck
   brew uninstall --cask liteduck
   ```

## Provision the CI token (one-time)

The `release.yml` jobs that touch other repos use a personal access token
exposed as the secret **`PUBLIC_RELEASE_TOKEN`** (the default `GITHUB_TOKEN`
cannot push to `liteduck-releases` or `homebrew-liteduck`). Create a fine-grained
PAT with **Contents: read/write** on both `bemindlabs/liteduck-releases` and
`bemindlabs/homebrew-liteduck`, then add it as a repo secret on the app repo.

## Bumping the cask on each release

### Automated (default)

Pushing a `v<version>` tag runs `release.yml`, whose final jobs:

1. `public-release` — mirrors the DMG/EXE/DEB/RPM/AppImage assets to
   `bemindlabs/liteduck-releases` under tag `v<version>`.
2. `update-homebrew` — downloads the DMG, computes its SHA-256, rewrites
   `Casks/liteduck.rb` in the tap, and pushes the bump commit.

So a normal release needs no manual Homebrew step:

```bash
./scripts/bump-version.sh 2026.5.3   # updates package.json, Cargo.toml, tauri.conf.json
git commit -am "Release 2026.5.3"
git tag v2026.5.3
git push origin main --tags
```

> **Keep the two copies in sync.** After the workflow bumps the tap, mirror the
> same change back into this repo's `HomebrewFormula/liteduck.rb` (version +
> both SHA-256 values) so the reviewed source of truth never drifts from what
> `brew` serves.
>
> **Known gaps in the current `update-homebrew` job** (flag for release owner):
> - It writes only the **aarch64** URL/sha256 — Intel users get no cask. The
>   source copy here already has both arches; the workflow heredoc should be
>   updated to compute and emit both.
> - Its `desc` reads "AI Coding workflow desktop app", which contradicts
>   LiteDuck's editor-only positioning. The accurate desc is in
>   `HomebrewFormula/liteduck.rb`.

### Manual bump (hotfix / workflow unavailable)

```bash
VERSION=2026.5.3

# 1. Download both DMGs from the public releases repo
gh release download "v$VERSION" --repo bemindlabs/liteduck-releases \
  --pattern "LiteDuck_${VERSION}_aarch64.dmg" \
  --pattern "LiteDuck_${VERSION}_x64.dmg"

# 2. Compute checksums
shasum -a 256 "LiteDuck_${VERSION}_aarch64.dmg"   # → on_arm sha256
shasum -a 256 "LiteDuck_${VERSION}_x64.dmg"        # → on_intel sha256

# 3. Edit Casks/liteduck.rb in the tap: bump `version` and paste both sha256s
# 4. Validate, commit, push
brew audit --cask Casks/liteduck.rb
brew style Casks/liteduck.rb
git commit -am "Update LiteDuck to $VERSION" && git push
```

## Checksums

The source cask in this repo ships placeholder SHA-256 values
(`000…000`) on purpose: the real digests only exist once the DMGs are built and
published, and a wrong-but-plausible hash is worse than an obviously-empty one.
The placeholders **will fail `brew install`** until replaced — never publish a
cask with them.

Each architecture needs its own digest; `sha256 :no_check` is deliberately
avoided so Homebrew verifies every download.

## Verifying a cask locally

```bash
brew audit --cask <path-or-name>     # metadata + URL reachability
brew style <path-or-name>            # Ruby style (rubocop)
brew install --cask <path-or-name>   # full install dry-run on a clean machine
```
