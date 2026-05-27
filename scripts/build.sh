#!/bin/bash
# Production build script for LiteDuck
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building LiteDuck..."
echo "Project root: $PROJECT_ROOT"

cd "$PROJECT_ROOT"

# Install frontend dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

# Run the Tauri production build
npm run tauri build

echo ""
echo "Build complete."
echo "Artifacts are in: src-tauri/target/release/bundle/"
