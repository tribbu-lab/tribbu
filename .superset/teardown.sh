#!/usr/bin/env bash
# No hay servicios que apagar (Supabase es hosteado, no hay Docker ni DB local).
# Sólo liberamos los node_modules del workspace, que son grandes (Expo incluido).
set -uo pipefail
cd "$(dirname "$0")/.."
rm -rf node_modules mobile/node_modules dist dist-web mobile/.expo
echo "🧹 Workspace limpio."
