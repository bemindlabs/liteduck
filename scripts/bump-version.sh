#!/bin/bash
# Bumps version in package.json, Cargo.toml, and tauri.conf.json
set -euo pipefail

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/bump-version.sh 2026.4.2"
  exit 1
fi

# Validate CalVer format (YYYY.M.D — no leading zeros in month/day)
# Also accepts suffixes: -beta.N or -N (e.g. 2026.4.2-beta.1, 2026.4.2-1)
if ! echo "$VERSION" | grep -qE '^[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*((-beta\.[1-9][0-9]*)|(-[1-9][0-9]*))?$'; then
  echo "Error: version must be in CalVer format YYYY.M.D (e.g. 2026.4.2)"
  echo "  - No leading zeros in month or day"
  echo "  - Optional suffix: -beta.N or -N (e.g. 2026.4.2-beta.1, 2026.4.2-1)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Bumping version to $VERSION..."

# --- package.json ---
PACKAGE_JSON="$PROJECT_ROOT/package.json"
# Use node for reliable JSON manipulation
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  package.json -> $VERSION"

# --- src-tauri/Cargo.toml ---
CARGO_TOML="$PROJECT_ROOT/src-tauri/Cargo.toml"
# Replace the version line inside [package] section only
# Uses awk to only modify the first occurrence (inside [package])
awk '
  /^\[package\]/ { in_pkg=1 }
  /^\[/ && !/^\[package\]/ { in_pkg=0 }
  in_pkg && /^version = / { sub(/^version = "[^"]*"/, "version = \"'"$VERSION"'\"") }
  { print }
' "$CARGO_TOML" > "$CARGO_TOML.tmp" && mv "$CARGO_TOML.tmp" "$CARGO_TOML"
echo "  Cargo.toml -> $VERSION"

# --- src-tauri/tauri.conf.json ---
TAURI_CONF="$PROJECT_ROOT/src-tauri/tauri.conf.json"
# Replace ONLY the top-level "version" value, preserving the rest of the file
# byte-for-byte. Do NOT strip "comments" or re-serialize: the config contains
# no real comments, and the previous `//` strip also matched the `http://…`
# URLs inside the CSP (and devUrl / timestampUrl), corrupting the file. VERSION
# is passed via the environment so it never lands inside the regex.
# `-0777` slurps the whole file; `s///` without /g replaces the first (top-level)
# "version" only.
NEW_VERSION="$VERSION" perl -0777 -i -pe \
  's/("version"\s*:\s*")[^"]*(")/$1 . $ENV{NEW_VERSION} . $2/e' "$TAURI_CONF"
# Fail loudly if the bump left the file as invalid JSON or didn't take effect.
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
if (conf.version !== '$VERSION') {
  console.error('Error: tauri.conf.json version is ' + conf.version + ', expected $VERSION');
  process.exit(1);
}
"
echo "  tauri.conf.json -> $VERSION"

echo ""
echo "Version bumped to $VERSION in all three files."
echo ""
echo "Next steps:"
echo "  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
echo "  git commit -m \"chore: bump version to $VERSION\""
echo "  git tag v$VERSION"
echo "  git push origin main --tags"
