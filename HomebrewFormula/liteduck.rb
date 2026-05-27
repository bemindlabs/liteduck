cask "liteduck" do
  version "2026.5.2"

  # ── Checksums ──────────────────────────────────────────────────────────────
  # TODO(release): replace the placeholder SHA-256 values below with the real
  # digests of the published DMGs before this cask is committed to the tap:
  #
  #   shasum -a 256 LiteDuck_#{version}_aarch64.dmg   # → arm
  #   shasum -a 256 LiteDuck_#{version}_x64.dmg        # → intel
  #
  # The release workflow (.github/workflows/release.yml → update-homebrew) does
  # this automatically on tag push. Keep this source copy in sync — see
  # docs/HOMEBREW.md. Until then these all-zero placeholders will fail
  # `brew install` (sha256 mismatch), which is intentional: never ship an
  # unverified download.
  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"

    url "https://github.com/bemindlabs/liteduck-releases/releases/download/v#{version}/LiteDuck_#{version}_aarch64.dmg"
  end
  on_intel do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"

    url "https://github.com/bemindlabs/liteduck-releases/releases/download/v#{version}/LiteDuck_#{version}_x64.dmg"
  end

  name "LiteDuck"
  desc "Lightweight code editor with file browser, terminal, and Git"
  homepage "https://buildonclaw.cloud/products/liteduck"

  # macOS 13 Ventura — matches src-tauri/tauri.conf.json minimumSystemVersion.
  depends_on macos: ">= :ventura"

  app "LiteDuck.app"

  zap trash: [
    "~/Library/Application Support/com.bemindlabs.liteduck",
    "~/Library/Caches/com.bemindlabs.liteduck",
    "~/Library/Preferences/com.bemindlabs.liteduck.plist",
    "~/Library/Saved Application State/com.bemindlabs.liteduck.savedState",
  ]
end
