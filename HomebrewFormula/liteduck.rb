# frozen_string_literal: true

# LiteDuck — built from source.
#
# This is a build-from-source formula (not a cask): `brew install` compiles the
# Tauri desktop app locally with Node + Rust. There is no prebuilt binary, no
# DMG, and no in-app auto-updater — `brew upgrade liteduck` rebuilds the new
# version from source.
#
# Trade-off of source distribution: the resulting LiteDuck.app is *unsigned and
# un-notarized*. macOS Gatekeeper may refuse to open it on the first launch;
# right-click → Open (or `xattr -dr com.apple.quarantine` on the .app) clears it.
#
# On each release: bump `url` to the new tag and replace `sha256` with the digest
# of the new source tarball (the version is scanned from the url) — see
# docs/RELEASING.md and docs/HOMEBREW.md.
class Liteduck < Formula
  desc "Lightweight code editor with file browser, terminal, and Git"
  homepage "https://buildonclaw.cloud/products/liteduck"
  url "https://github.com/bemindlabs/liteduck/archive/refs/tags/v2026.6.6.tar.gz"
  sha256 "9897c1daacc792fd6e27e42322875bc3716d68ccf419e8e168ea0b7124e49042"
  license "MIT"

  depends_on "node" => :build
  depends_on "rust" => :build
  depends_on :macos
  # macOS 13 Ventura — matches src-tauri/tauri.conf.json minimumSystemVersion.
  depends_on macos: :ventura

  def install
    # Install JS deps and build the Tauri desktop bundle (app target only — no
    # DMG, no signing). The frontend (vite) build runs as part of `tauri build`
    # via beforeBuildCommand in tauri.conf.json.
    system "npm", "ci"
    system "npm", "run", "tauri", "build", "--", "--bundles", "app"

    # The Tauri build emits the .app under the release bundle directory.
    # Because the repo root carries a Cargo workspace manifest, the Cargo
    # target dir (and therefore the Tauri bundle) lives at the workspace root
    # `target/…`, NOT under `src-tauri/target/…`.
    app_bundle = "target/release/bundle/macos/LiteDuck.app"
    prefix.install app_bundle => "LiteDuck.app"

    # Expose the inner Mach-O on PATH so `liteduck` launches the app binary.
    bin.install_symlink prefix/"LiteDuck.app/Contents/MacOS/LiteDuck" => "liteduck"
  end

  def caveats
    <<~EOS
      LiteDuck is built from source and is NOT code-signed or notarized.
      The first time you open it, macOS Gatekeeper may block it. To allow it:
        - Right-click LiteDuck.app and choose "Open", or
        - run: xattr -dr com.apple.quarantine "#{opt_prefix}/LiteDuck.app"

      The app bundle lives at:
        #{opt_prefix}/LiteDuck.app
      Homebrew's install sandbox can't place it in /Applications itself. Add it
      with ONE of:

        # Symlink — auto-updates on `brew upgrade`; shows in Finder & Spotlight,
        # but NOT Launchpad (Launchpad ignores symlinked apps):
        ln -sfn "#{opt_prefix}/LiteDuck.app" /Applications/LiteDuck.app

        # Copy — also shows in Launchpad, but is a snapshot: re-run after each
        # `brew upgrade` to refresh it:
        cp -R "#{opt_prefix}/LiteDuck.app" /Applications/LiteDuck.app

      Remove with `rm -rf /Applications/LiteDuck.app` if you uninstall.
    EOS
  end

  test do
    assert_path_exists prefix/"LiteDuck.app"
    assert_predicate prefix/"LiteDuck.app/Contents/MacOS/LiteDuck", :executable?
  end
end
