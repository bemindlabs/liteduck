# Releasing LiteDuck

LiteDuck is distributed **only** through Homebrew, **built from source**. There is
no CI release pipeline, no DMG, no notarization, and no in-app updater. A "release"
is just a git tag plus a one-line bump of the Homebrew formula.

> **Scope:** macOS only (Apple Silicon + Intel — Homebrew builds for whatever arch
> the user is on). Windows and Linux are deferred.

---

## TL;DR — how to cut a release

1. Bump the version in **all three** files to the same value (CalVer, `YYYY.M.D`):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`

   (`./scripts/bump-version.sh <version>` does all three.)

2. Move the `## [Unreleased]` notes in `CHANGELOG.md` under a new
   `## [<version>] - <date>` heading.

3. Commit, then tag and push the tag:

   ```bash
   git commit -am "Release <version>"
   git tag v<version>
   git push origin main --tags
   ```

4. Update the Homebrew formula (version + `sha256`) — see below.

That's it. Users pick up the new version with `brew upgrade liteduck`, which
re-compiles the tagged source.

---

## Updating the Homebrew formula

The tap repo **`bemindlabs/homebrew-liteduck`** serves `Formula/liteduck.rb`. The
reviewed source of truth lives in this repo at
[`HomebrewFormula/liteduck.rb`](../HomebrewFormula/liteduck.rb). On each release,
update **both** copies:

```bash
VERSION=2026.5.3

# 1. Fetch the source tarball GitHub auto-generates for the tag and hash it.
curl -fsSL -o "v${VERSION}.tar.gz" \
  "https://github.com/bemindlabs/liteduck/archive/refs/tags/v${VERSION}.tar.gz"
shasum -a 256 "v${VERSION}.tar.gz"   # → the new sha256

# 2. In HomebrewFormula/liteduck.rb (and the tap's Formula/liteduck.rb):
#    - bump `url`, `version`
#    - paste the sha256
# 3. Validate and push the tap.
brew audit --new Formula/liteduck.rb
brew style Formula/liteduck.rb
git commit -am "liteduck <version>" && git push
```

See [HOMEBREW.md](HOMEBREW.md) for the full tap layout and one-time setup.

---

## Flow at a glance

```
bump version (package.json / tauri.conf.json / Cargo.toml)
        │  commit
        ▼
git tag v<version> && git push --tags
        │
        ▼
update HomebrewFormula/liteduck.rb (url + version + sha256)
        │  mirror into bemindlabs/homebrew-liteduck → Formula/liteduck.rb
        ▼
users run `brew upgrade liteduck`  →  brew rebuilds from the tagged source
```

---

## Notes

- **No signing/notarization.** The source build is unsigned; Gatekeeper may require
  right-click → Open on first launch. This is the deliberate trade-off of source
  distribution. (To ship a signed/notarized build later you'd reintroduce a build
  pipeline — out of scope here.)
- **No secrets required.** Without a CI release pipeline there is no `RELEASE_PAT`,
  no `PUBLIC_RELEASE_TOKEN`, and no Apple signing secrets to maintain.
- **CI still runs** for quality (`.github/workflows/ci.yml`) and E2E regression
  (`.github/workflows/regression.yml`) — those are unaffected by this change.
