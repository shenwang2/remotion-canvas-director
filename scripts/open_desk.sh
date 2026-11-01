#!/usr/bin/env bash
# Open the edit desk for a work directory: preview with hand edits on top, export with the same renderer.
#   bash scripts/open_desk.sh <work> [port]      -> http://127.0.0.1:5180
# In the Claude desktop app, prefer a .claude/launch.json entry running the same command and preview_start.
set -e
R="${CANVAS_RUNTIME:-$HOME/canvas-director-runtime}"
cd "$R" && node desk/start.mjs "$1" $2   # builds for production first (~20 s); picks a free port from 5180 and prints the address
