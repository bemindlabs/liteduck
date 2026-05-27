#!/bin/bash
set -euo pipefail

# ============================================================
# LiteDuck — macOS App Store Build, Sign & Upload
# ============================================================
#
# Prerequisites:
#   - "Apple Distribution" certificate installed in keychain
#   - Optionally: "3rd Party Mac Developer Installer" cert for signed .pkg
#   - App-specific password stored: xcrun notarytool store-credentials "AC_PASSWORD"
#
# Usage:
#   bash scripts/appstore-upload.sh          # Full build + sign + upload
#   bash scripts/appstore-upload.sh --skip-build   # Skip build, reuse last
#

APP_NAME="LiteDuck"
BUNDLE_ID="com.bemindlabs.liteduck"
VERSION="0.1.4"
APPLE_ID="littleplantstudio@gmail.com"
TEAM_ID="944QFC9G5N"

# Paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_PATH="$PROJECT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app"
ENTITLEMENTS="$PROJECT_DIR/src-tauri/entitlements/app.entitlements"
PKG_PATH="$PROJECT_DIR/src-tauri/target/release/bundle/$APP_NAME-$VERSION.pkg"

# Signing identities (use SHA-1 hash to avoid ambiguity with duplicate certs)
SIGN_APP="F40BE50419322ED0298F81532BD352CE3265E2DA"

# Check for installer cert (optional — falls back to unsigned .pkg)
SIGN_INSTALLER=""
if security find-identity -v | grep -q "3rd Party Mac Developer Installer"; then
    SIGN_INSTALLER="3rd Party Mac Developer Installer: Pituk Kaewsuksai ($TEAM_ID)"
fi

SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
    SKIP_BUILD=true
fi

echo "============================================"
echo "  $APP_NAME v$VERSION — App Store Upload"
echo "============================================"
echo ""

# ---- Step 1: Build ----
if [ "$SKIP_BUILD" = true ]; then
    echo "[1/5] Skipping build (--skip-build)"
    if [ ! -d "$APP_PATH" ]; then
        echo "ERROR: No existing build at $APP_PATH"
        exit 1
    fi
else
    echo "[1/5] Building release..."
    cd "$PROJECT_DIR"
    npx @tauri-apps/cli build 2>&1 | tail -5

    if [ ! -d "$APP_PATH" ]; then
        echo "ERROR: Build failed — $APP_PATH not found"
        exit 1
    fi
fi
echo "  ✓ Build ready: $APP_PATH"
echo ""

# ---- Step 2: Update Info.plist for App Store ----
echo "[2/5] Updating Info.plist..."
PLIST="$APP_PATH/Contents/Info.plist"

/usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion 13.0" "$PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 13.0" "$PLIST"

/usr/libexec/PlistBuddy -c "Delete :LSRequiresCarbon" "$PLIST" 2>/dev/null || true

/usr/libexec/PlistBuddy -c "Set :LSApplicationCategoryType public.app-category.developer-tools" "$PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.developer-tools" "$PLIST"

# Ensure CFBundleShortVersionString and CFBundleVersion are set
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST"

# App Store requires a build number — use date-based integer
BUILD_NUMBER="$(date +%Y%m%d%H)"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $BUILD_NUMBER" "$PLIST"

echo "  ✓ Info.plist updated (version $VERSION, build $BUILD_NUMBER)"
echo ""

# ---- Step 3: Code sign ----
echo "[3/5] Code signing with: $SIGN_APP"

# Sign all nested binaries, dylibs, frameworks first (deep)
find "$APP_PATH/Contents" \( -name "*.dylib" -o -name "*.framework" -o -type f -perm +111 \) \
    2>/dev/null | while read -r item; do
    codesign --force --options runtime --sign "$SIGN_APP" --entitlements "$ENTITLEMENTS" "$item" 2>/dev/null || true
done

# Sign the main binary (name comes from Cargo.toml, not productName)
MAIN_BIN="$APP_PATH/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PATH/Contents/Info.plist")"
codesign --force --options runtime --sign "$SIGN_APP" --entitlements "$ENTITLEMENTS" "$MAIN_BIN"

# Sign the app bundle
codesign --force --options runtime --sign "$SIGN_APP" --entitlements "$ENTITLEMENTS" "$APP_PATH"

echo "  ✓ Code signed"

# Verify
codesign --verify --deep --strict "$APP_PATH"
echo "  ✓ Signature verified"
echo ""

# ---- Step 4: Package as .pkg ----
echo "[4/5] Creating installer package..."

if [ -n "$SIGN_INSTALLER" ]; then
    echo "  Using signed .pkg (installer cert found)"
    productbuild \
        --component "$APP_PATH" /Applications \
        --sign "$SIGN_INSTALLER" \
        "$PKG_PATH"
else
    echo "  Using unsigned .pkg (no installer cert — will still upload)"
    productbuild \
        --component "$APP_PATH" /Applications \
        "$PKG_PATH"
fi

echo "  ✓ Package created: $PKG_PATH"
echo "  Size: $(du -h "$PKG_PATH" | cut -f1)"
echo ""

# ---- Step 5: Upload to App Store Connect ----
echo "[5/5] Uploading to App Store Connect..."

# Prefer xcrun notarytool / Transporter over deprecated altool
if xcrun notarytool --help &>/dev/null; then
    xcrun notarytool submit "$PKG_PATH" \
        --keychain-profile "AC_PASSWORD" \
        --wait
else
    # Fallback to altool (deprecated but still works)
    xcrun altool --upload-app \
        --type osx \
        --file "$PKG_PATH" \
        --apple-id "$APPLE_ID" \
        --team-id "$TEAM_ID" \
        --keychain-profile "AC_PASSWORD"
fi

echo ""
echo "============================================"
echo "  ✓ Upload complete!"
echo "  Go to App Store Connect to submit for review."
echo "  https://appstoreconnect.apple.com"
echo "============================================"
