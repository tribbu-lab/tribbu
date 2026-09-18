#!/usr/bin/env bash
# Prepara un workspace nuevo de tribbu: secretos locales (gitignored) + dependencias.
# No hay base de datos local ni Docker: Supabase es hosteado, así que sólo hace
# falta el .env con la URL + anon key.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="${SUPERSET_ROOT_PATH:-}"

copiar() { # copiar <ruta relativa> — trae el archivo gitignored desde el repo raíz
  local rel="$1"
  if [ -n "$ROOT" ] && [ -f "$ROOT/$rel" ] && [ ! -e "$rel" ]; then
    mkdir -p "$(dirname "$rel")"
    cp "$ROOT/$rel" "$rel"
    echo "→ copiado $rel desde el repo raíz"
  fi
}

# Secretos / config local que no están versionados
copiar .env
copiar mobile/.env
copiar mobile/google-services.json      # push FCM (builds Android)
copiar mobile/play-service-account.json # eas submit a Play

if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠  No se encontró .env en el repo raíz: copié .env.example."
  echo "   Completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY antes de correr la app."
fi

# Web (Vite + React)
echo "→ instalando dependencias web…"
npm ci --no-audit --fund=false || npm install --no-audit --fund=false

# Mobile (Expo). Es el install más pesado del repo; se puede saltear con
# TRIBBU_SKIP_MOBILE_INSTALL=1 si sólo vas a tocar src/.
if [ "${TRIBBU_SKIP_MOBILE_INSTALL:-0}" = "1" ]; then
  echo "→ mobile: install salteado (TRIBBU_SKIP_MOBILE_INSTALL=1)"
else
  echo "→ instalando dependencias mobile (Expo)…"
  ( cd mobile && { npm ci --no-audit --fund=false || npm install --no-audit --fund=false; } )
fi

echo "✅ Workspace listo. Web: npm run dev · Mobile: cd mobile && npm start"
