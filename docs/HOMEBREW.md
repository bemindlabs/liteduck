# Homebrew Formula — LiteDuck

How LiteDuck is distributed through Homebrew, how to create/publish the tap the
first time, and how to bump the formula on every release.

LiteDuck ships as a **build-from-source formula** (not a cask): `brew install`
compiles the Tauri app locally with Node + Rust. There is no prebuilt binary, no
DMG, and no in-app updater — `brew upgrade liteduck` rebuilds the new version from
source.

End users install with:

```bash
brew tap bemindlabs/liteduck https://github.com/bemindlabs/liteduck
brew install bemindlabs/liteduck/liteduck
```

There is **no separate `homebrew-liteduck` tap repo**. The formula lives in the
LiteDuck project repo itself, in its `HomebrewFormula/` directory — a directory
name Homebrew recognises specifically so a project can host its own formula. The
two-argument `brew tap <name> <url>` form points the tap straight at
`github.com/bemindlabs/liteduck` (the one-argument shorthand can't be used because
it would look for a `homebrew-`-prefixed repo). The source archive the formula
downloads is the GitHub-generated tarball for the release tag in the same repo.

## Moving parts

| Thing | Where | Role |
|---|---|---|
| Formula (source of truth + what `brew` reads) | this repo → [`HomebrewFormula/liteduck.rb`](../HomebrewFormula/liteduck.rb) | One copy, in version control next to the app; tapped directly |
| Source archive | `bemindlabs/liteduck` → tag `v<version>` | The `.tar.gz` the formula downloads and compiles |

The formula downloads one URL — the GitHub auto-generated source archive for the
tag:

```
https://github.com/bemindlabs/liteduck/archive/refs/tags/v2026.5.2.tar.gz
```

`brew` then runs `npm ci` + `npm run tauri build -- --bundles app` and installs the
resulting `LiteDuck.app` into the formula prefix, symlinking the inner binary onto
`PATH` as `liteduck`.

A formula keeps the `.app` under the Homebrew prefix, so it does **not** appear in
Finder / Launchpad / Spotlight the way a cask's `/Applications` install would.
Homebrew's install sandbox forbids a formula from writing to `/Applications`
(a `post_install` symlink there fails), so the `caveats` block instead gives the
user a one-line command to create the link themselves (pointing at the stable
`opt` path so it survives `brew upgrade`):

```bash
ln -sfn "$(brew --prefix)/opt/liteduck/LiteDuck.app" /Applications/LiteDuck.app
```

## Unsigned build — the trade-off

Because the app is compiled locally and **not** code-signed or notarized, macOS
Gatekeeper may block it on first launch. The formula's `caveats` block tells the
user how to allow it (right-click → Open, or `xattr -dr com.apple.quarantine`).
This is the deliberate cost of source distribution; signing would require a build
pipeline and Apple credentials, which this project intentionally does not run.

## No separate tap repo

The LiteDuck project repo **is** the tap. Because the formula lives in
`HomebrewFormula/liteduck.rb` (already committed and version-controlled), there is
nothing to create or seed — users tap the repo directly with the two-argument
form and Homebrew finds the formula in that directory.

```bash
brew tap bemindlabs/liteduck https://github.com/bemindlabs/liteduck
brew install bemindlabs/liteduck/liteduck
```

**Smoke-test the end-user path** (this compiles from source, so it is slow):

```bash
brew tap bemindlabs/liteduck https://github.com/bemindlabs/liteduck
brew install bemindlabs/liteduck/liteduck
brew test liteduck
brew untap bemindlabs/liteduck   # reset
```

> A dedicated `homebrew-liteduck` tap repo (so the shorter
> `brew tap bemindlabs/liteduck` works without the explicit URL) is a possible
> future change, but it would mean keeping two copies of the formula in sync.
> The single-repo approach above keeps one source of truth.

## Bumping the formula on each release

There is no automation — bump by hand on every tag:

```bash
VERSION=2026.5.29

# 1. Fetch the source tarball GitHub auto-generates for the tag and hash it.
curl -fsSL -o "v${VERSION}.tar.gz" \
  "https://github.com/bemindlabs/liteduck/archive/refs/tags/v${VERSION}.tar.gz"
shasum -a 256 "v${VERSION}.tar.gz"   # → new sha256

# 2. In HomebrewFormula/liteduck.rb (this repo — the only copy):
#    bump `url` and paste the new sha256 (version is scanned from the url).
# 3. Validate, commit, push.
brew audit HomebrewFormula/liteduck.rb
brew style HomebrewFormula/liteduck.rb
git commit -am "liteduck ${VERSION}" && git push
```

> **One copy.** Because the formula is tapped straight from this repo, there is no
> second copy to keep in sync — bump `HomebrewFormula/liteduck.rb` and push.

## Checksum

The source formula in this repo ships a placeholder sha256 (`000…000`) on purpose:
the real digest only exists once the tag is pushed and GitHub generates the source
archive, and a wrong-but-plausible hash is worse than an obviously-empty one. The
placeholder **will fail `brew install`** until replaced — never publish a formula
with it.

## Verifying a formula locally

```bash
brew audit <path-or-name>       # metadata + URL reachability
brew style <path-or-name>       # Ruby style (rubocop)
brew install --build-from-source <path-or-name>   # full source build
brew test <name>                # runs the `test do` block
```
