# Shared pipeline environment — sourced by every step script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/data/raw"
WORK="$ROOT/data/work"
OUT="$ROOT/app/public/data"
SRC="$ROOT/pipeline/src"

mkdir -p "$RAW" "$WORK" "$OUT"

# Design frame in EPSG:3006 (SWEREF99 TM): Sweden + neighbor context margin.
# Everything that only exists as backdrop (neighbors, graticule, DEM) is clipped to this.
FRAME_XMIN=45000
FRAME_YMIN=6098000
FRAME_XMAX=1145000
FRAME_YMAX=7707000

# Same frame in lon/lat with margin, for clipping raw WGS84 sources cheaply.
FRAME4326="2 53.5 33 71.5"

# Simplification tiers (meters). At A1 (~1:2M) 100 m ≈ 0.05 mm — invisible in print.
INTERVAL_PRINT=100
INTERVAL_PREVIEW=450

MAPSHAPER="$ROOT/pipeline/node_modules/.bin/mapshaper"
export NODE_OPTIONS="--max-old-space-size=8192"

log() { printf '\033[1;34m[pipeline]\033[0m %s\n' "$*"; }
