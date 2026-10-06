#!/bin/sh
# Escape from Work: host the game on this computer (macOS / Linux). See docs/LAN.md.
# Run it from a terminal: ./start-server.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again."
  exit 1
fi
exec node scripts/start-server.mjs
