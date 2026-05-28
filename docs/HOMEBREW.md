# Homebrew Formula — LiteDuck

How LiteDuck is distributed through Homebrew, how to create/publish the tap the
first time, and how to bump the formula on every release.

LiteDuck ships as a **build-from-source formula** (not a cask): `brew install`
compiles the Tauri app locally with Node + Rust. There is no prebuilt binary, no
DMG, and no in-app updater — `brew upgrade liteduck` rebuilds the new version from
source.

End users install with:

```bash
brew install bemindlabs/liteduck/liteduck
```

That shorthand resolves to the tap repository **`bemindlabs/homebrew-liteduck`**
(Homebrew strips the `homebrew-` prefix) and the formula `Formula/liteduck.rb`
inside it. The source archive it downloads is the GitHub-generated tarball for the
release tag in **`bemindlabs/liteduck`**.

## Moving parts

| Thing | Where | Role |
|---|---|---|
| Formula source of truth | this repo → [`HomebrewFormula/liteduck.rb`](../HomebrewFormula/liteduck.rb) | Reviewed copy, kept in version control next to the app |
| Published formula | `bemindlabs/homebrew-liteduck` → `Formula/liteduck.rb` | What `brew` actually reads |
| Source archive | `bemindlabs/liteduck` → tag `v<version>` | The `.tar.gz` the formula downloads and compiles |

The formula downloads one URL — the GitHub auto-generated source archive for the
tag:

```
https://github.com/bemindlabs/liteduck/archive/refs/tags/v2026.5.2.tar.gz
```

`brew` then runs `npm ci` + `npm run tauri build -- --bundles app` and installs the
resulting `LiteDuck.app` into the formula prefix, symlinking the inner binary onto
`PATH` as `liteduck`.

## Unsigned build — the trade-off

Because the app is compiled locally and **not** code-signed or notarized, macOS
Gatekeeper may block it on first launch. The formula's `caveats` block tells the
user how to allow it (right-click → Open, or `xattr -dr com.apple.quarantine`).
This is the deliberate cost of source distribution; signing would require a build
pipeline and Apple credentials, which this project intentionally does not run.

## One-time: create and publish the tap

1. **Create the GitHub repo** `bemindlabs/homebrew-liteduck` (public). The
   `homebrew-` prefix is required — `brew tap bemindlabs/liteduck` looks for it.

2. **Lay out the tap:**

   ```bash
   git clone https://github.com/bemindlabs/homebrew-liteduck.git
   cd homebrew-liteduck
   mkdir -p Formula
   # Seed the published formula from this repo's source-of-truth copy:
   cp /path/to/liteduck/HomebrewFormula/liteduck.rb Formula/liteduck.rb
   ```

3. **Fill in the real sha256** (the source copy ships a zero-placeholder on
   purpose — see "Checksum" below), then validate:

   ```bash
   brew audit --new Formula/liteduck.rb
   brew style Formula/liteduck.rb
   ```

4. **Commit and push:**

   ```bash
   git add Formula/liteduck.rb
   git commit -m "Add LiteDuck formula"
   git push origin main
   ```

5. **Smoke-test the end-user path** (this compiles from source, so it is slow):

   ```bash
   brew install bemindlabs/liteduck/liteduck
   brew test liteduck
   brew uninstall liteduck
   ```

## Bumping the formula on each release

There is no automation — bump by hand on every tag:

```bash
VERSION=2026.5.3

# 1. Fetch the source tarball GitHub auto-generates for the tag and hash it.
curl -fsSL -o "v${VERSION}.tar.gz" \
  "https://github.com/bemindlabs/liteduck/archive/refs/tags/v${VERSION}.tar.gz"
shasum -a 256 "v${VERSION}.tar.gz"   # → new sha256

# 2. In Formula/liteduck.rb (tap) AND HomebrewFormula/liteduck.rb (this repo):
#    bump `url`, `version`, and paste the new sha256.
# 3. Validate, commit, push.
brew audit Formula/liteduck.rb
brew style Formula/liteduck.rb
git commit -am "liteduck ${VERSION}" && git push
```

> **Keep the two copies in sync.** The reviewed source of truth here
> (`HomebrewFormula/liteduck.rb`) must never drift from what the tap serves
> (`bemindlabs/homebrew-liteduck` → `Formula/liteduck.rb`).

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
