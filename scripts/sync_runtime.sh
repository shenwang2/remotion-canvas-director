#!/usr/bin/env bash
# Copy the template into the runtime folder (installs deps on first use).
set -e
K="$(cd "$(dirname "$0")/.." && pwd)"
R="${1:-${CANVAS_RUNTIME:-$HOME/canvas-director-runtime}}"
mkdir -p "$R/src" "$R/desk"
cp "$K"/template/src/* "$R/src/"
cp "$K"/template/desk/* "$R/desk/"   # the edit desk (open_desk.sh)
cp "$K/template/package.json" "$K/template/tsconfig.json" "$R/"
(cd "$R" && npm install --no-audit --no-fund)  # quick when nothing changed; picks up new dependencies
(cd "$R" && npx tsc -p .)
echo "runtime ready: $R"
