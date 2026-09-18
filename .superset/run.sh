#!/usr/bin/env bash
# Dev server web (Vite). --host para que sea alcanzable desde fuera del workspace.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --no-audit --fund=false
exec npm run dev -- --host ${PORT:+--port "$PORT"}
