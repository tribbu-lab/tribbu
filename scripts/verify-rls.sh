#!/usr/bin/env bash
# =============================================================================
# verify-rls.sh — Verificación before/after del hardening RLS de tribbu.
#
# Corre solo LECTURAS (GET) + el POST de login demo contra la API de Supabase.
# Lee la URL y la anon key de mobile/.env (NO hardcodea secretos, NO los imprime).
#
# Uso:
#   bash scripts/verify-rls.sh                # antes y después de aplicar el SQL
#
# Interpretación:
#   ANTES del hardening  → verás filas de cursos AJENOS y filas ANÓNIMAS (la fuga).
#   DESPUÉS del hardening → "cursos ajenos" = 0 en todas, "anon" = 0 en todas,
#                           y tus datos propios (curso demo) siguen accesibles.
#
# Requiere: bash, curl, jq.
# =============================================================================
set -u

ENV_FILE="${ENV_FILE:-mobile/.env}"
# Resolver ruta relativa al root del repo si se ejecuta desde otro lado.
if [ ! -f "$ENV_FILE" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  ENV_FILE="$ROOT/mobile/.env"
fi
[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE"; exit 1; }

# Cargar URL/KEY sin imprimirlas.
set -a; . "$ENV_FILE"; set +a
URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Faltan EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY en $ENV_FILE"; exit 1; }

command -v jq   >/dev/null || { echo "Falta jq";   exit 1; }
command -v curl >/dev/null || { echo "Falta curl"; exit 1; }

# --- Credenciales demo (cuenta de prueba, apoderada/Room Parent de 1 solo curso) ---
DEMO_EMAIL="${DEMO_EMAIL:-demo@tribbu.app}"
DEMO_PASS="${DEMO_PASS:-TribbuDemo2026!}"
DEMO_CURSO="${DEMO_CURSO:-5f4b9003-406d-41f6-b932-8e836cc38d18}"  # "3°A — Primaria"

# Tablas con columna curso_id (para medir fuga cross-curso directa).
TABLES_CURSO=(hijos maestro_cursos usuario_cursos cumples eventos recordatorios \
  colectas utiles libros uniforme_cursos horarios alertas)
# Tablas sin curso_id que igual no deben exponer todo el colegio.
TABLES_OTRAS=(usuarios cursos usuario_hijos evento_asistencia recordatorio_leidos \
  colecta_pagos util_adquirido libro_adquirido uniforme_adquirido contactos \
  codigos_invitacion)
# Tablas que un anónimo NO debe poder leer (menu/uniformes son globales, se testean aparte).
TABLES_ANON=(hijos maestros maestro_cursos menu usuarios cursos usuario_cursos \
  cumples eventos recordatorios colectas horarios codigos_invitacion)

# --- Login demo (token en variable local, nunca impreso) ---
RESP=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASS\"}")
TOKEN=$(echo "$RESP" | jq -r '.access_token // empty')
[ -n "$TOKEN" ] || { echo "Login demo FALLÓ (revisá credenciales/DEMO_EMAIL/DEMO_PASS)"; exit 1; }

# Content-Range → total de filas visibles (con Prefer: count=exact).
rows_count() { # $1 tabla ; $2.. headers extra
  local t="$1"; shift
  curl -s -D - -o /dev/null -H "apikey: $KEY" "$@" \
    -H "Prefer: count=exact" -H "Range: 0-0" \
    "$URL/rest/v1/$t?select=*&limit=1" \
    | tr -d '\r' | awk -F'/' 'tolower($0) ~ /^content-range/ {print $2}'
}
# Cursos distintos != demo en una tabla con curso_id.
foreign_cursos() { # $1 tabla ; $2.. headers
  local t="$1"; shift
  curl -s -H "apikey: $KEY" "$@" "$URL/rest/v1/$t?select=curso_id" \
    | jq -r --arg d "$DEMO_CURSO" \
      'if type=="array" then ([.[].curso_id]|map(select(.!=null and .!=$d))|unique|length) else "err" end' 2>/dev/null
}

AUTH=(-H "Authorization: Bearer $TOKEN")
fail=0

echo "================ tribbu · verificación RLS ================"
echo "Proyecto: $(echo "$URL" | sed 's#https://##')   demo: $DEMO_EMAIL (curso $DEMO_CURSO)"
echo

echo "--- A) Fuga cross-curso (autenticado como demo) ------------"
printf '%-20s | %-10s | %-14s\n' "tabla" "filas" "cursos_ajenos"
for t in "${TABLES_CURSO[@]}"; do
  n=$(rows_count "$t" "${AUTH[@]}"); [ -z "$n" ] && n="?"
  fc=$(foreign_cursos "$t" "${AUTH[@]}"); [ -z "$fc" ] && fc="?"
  flag=""; if [ "$fc" != "0" ] && [ "$fc" != "err" ] && [ "$fc" != "?" ]; then flag="  <== FUGA"; fail=1; fi
  printf '%-20s | %-10s | %-14s%s\n' "$t" "$n" "$fc" "$flag"
done
echo "(esperado DESPUÉS del hardening: cursos_ajenos = 0 en todas)"
echo

echo "--- B) Tablas sin curso_id: no deben exponer todo el colegio ---"
printf '%-20s | %-10s\n' "tabla" "filas_visibles"
for t in "${TABLES_OTRAS[@]}"; do
  n=$(rows_count "$t" "${AUTH[@]}"); [ -z "$n" ] && n="?"
  printf '%-20s | %-10s\n' "$t" "$n"
done
echo "(usuarios debería bajar a los compañeros del curso demo; cursos a 1;"
echo " codigos_invitacion a 0 salvo que la demo tenga códigos de su curso)"
echo

echo "--- C) Acceso ANÓNIMO (solo apikey, sin sesión): debe ser 0 ---"
printf '%-20s | %-10s\n' "tabla" "filas_anon"
for t in "${TABLES_ANON[@]}"; do
  n=$(rows_count "$t"); [ -z "$n" ] && n="?"
  flag=""; if [ "$n" != "0" ] && [ "$n" != "?" ]; then flag="  <== FUGA ANÓNIMA"; fail=1; fi
  printf '%-20s | %-10s%s\n' "$t" "$n" "$flag"
done
echo "(esperado DESPUÉS del hardening: 0 en todas)"
echo

echo "--- D) Datos propios de la demo: deben SEGUIR accesibles -------"
MI_ID=$(curl -s -H "apikey: $KEY" "${AUTH[@]}" \
  "$URL/rest/v1/usuarios?select=id&limit=1" | jq -r '.[0].id // empty')
MI_CURSO=$(curl -s -H "apikey: $KEY" "${AUTH[@]}" \
  "$URL/rest/v1/cursos?select=id,nombre" | jq -r --arg d "$DEMO_CURSO" \
  'map(select(.id==$d)) | if length>0 then .[0].nombre else "NO VISIBLE" end')
MIS_HIJOS=$(rows_count "hijos" "${AUTH[@]}")
echo "Mi fila usuarios visible : $([ -n "$MI_ID" ] && echo "sí" || echo "NO  <== ROTO")"
echo "Mi curso demo visible    : $MI_CURSO"
echo "Hijos visibles (mi curso): ${MIS_HIJOS:-?}"
if [ -z "$MI_ID" ] || [ "$MI_CURSO" = "NO VISIBLE" ]; then
  echo "  <== La demo perdió acceso a lo propio: revisar policies."
  fail=1
fi
echo

echo "--- E) RPC del registro (existen tras aplicar el SQL) ---------"
VC=$(curl -s -X POST "$URL/rest/v1/rpc/verificar_codigo" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_codigo":"__NO_EXISTE__"}')
if echo "$VC" | jq -e '.valido==false' >/dev/null 2>&1; then
  echo "verificar_codigo(): OK (responde {valido:false} para código inexistente)"
elif echo "$VC" | jq -e '.code // .message' >/dev/null 2>&1; then
  echo "verificar_codigo(): aún NO existe (correr rls-hardening.sql). Detalle: $(echo "$VC" | jq -c '{code,message,hint}' 2>/dev/null)"
else
  echo "verificar_codigo(): respuesta inesperada: $VC"
fi
echo

echo "==========================================================="
if [ "$fail" = "0" ]; then
  echo "RESULTADO: sin fugas detectadas en las probes."
else
  echo "RESULTADO: se detectaron FUGAS (ver marcas '<== FUGA'). Si es ANTES del"
  echo "           hardening, es lo esperado. Si es DESPUÉS, revisar el SQL."
fi
echo "==========================================================="
