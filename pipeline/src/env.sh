# Shared pipeline environment — sourced by every step script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/data/raw"
WORK="$ROOT/data/work"
OUT="$ROOT/app/public/data"
SRC="$ROOT/pipeline/src"

mkdir -p "$RAW" "$WORK" "$OUT"

# All country-specific facts (frame, EPSG, extract URL, admin levels, DEM sweep)
# come from pipeline/country.json — see load-config.mjs.
eval "$(node "$SRC/load-config.mjs" --bash)"

# Simplification tiers (meters). At A1 (~1:2M) 100 m ≈ 0.05 mm — invisible in print.
INTERVAL_PRINT=100
INTERVAL_PREVIEW=450

MAPSHAPER="$ROOT/pipeline/node_modules/.bin/mapshaper"
export NODE_OPTIONS="--max-old-space-size=8192"

log() { printf '\033[1;34m[pipeline]\033[0m %s\n' "$*"; }
