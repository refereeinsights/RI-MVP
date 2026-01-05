#!/usr/bin/env bash
set -euo pipefail

# Simple smoke checks for Supabase REST and Google Places using .env.local
# Usage: scripts/smoke.sh [env-file]
# Defaults to ./.env.local

ENV_FILE="${1:-.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

SUPABASE_HOST="${NEXT_PUBLIC_SUPABASE_URL:-$SUPABASE_URL:-}"
SUPABASE_ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
PLACES_KEY="${GOOGLE_PLACES_API_KEY:-}"

if [[ -z "$SUPABASE_HOST" || -z "$SUPABASE_ANON" ]]; then
  echo "Missing Supabase host or anon key in env." >&2
  exit 1
fi

echo "1) Supabase host HEAD: $SUPABASE_HOST"
curl -I "$SUPABASE_HOST" || true
echo ""

echo "2) Supabase REST owls_eye_runs sample"
curl -i "$SUPABASE_HOST/rest/v1/owls_eye_runs?select=id,run_id,created_at,completed_at&limit=1" \
  -H "apikey: $SUPABASE_ANON" \
  -H "Authorization: Bearer $SUPABASE_ANON" || true
echo ""

if [[ -n "${TI_MAP_BASE_URL:-}" && -n "${TI_MAP_VENUE_ID:-}" ]]; then
  echo "3) TI Web map fetch: ${TI_MAP_BASE_URL}/venues/maps/${TI_MAP_VENUE_ID}"
  curl -i "${TI_MAP_BASE_URL}/venues/maps/${TI_MAP_VENUE_ID}" || true
  echo ""
else
  echo "3) TI Web map fetch skipped (set TI_MAP_BASE_URL and TI_MAP_VENUE_ID to enable)"
fi

if [[ -n "$PLACES_KEY" ]]; then
  echo "4) Google Places Nearby (cafe) around Googleplex"
  curl -i -X POST "https://places.googleapis.com/v1/places:searchNearby" \
    -H "Content-Type: application/json" \
    -H "X-Goog-Api-Key: $PLACES_KEY" \
    -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location" \
    -d '{"maxResultCount":2,"rankPreference":"DISTANCE","locationRestriction":{"circle":{"center":{"latitude":37.4219999,"longitude":-122.0840575},"radius":1500}},"includedTypes":["cafe"]}' || true
  echo ""
else
  echo "4) Google Places test skipped (GOOGLE_PLACES_API_KEY missing)"
fi
