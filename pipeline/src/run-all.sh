#!/usr/bin/env bash
# Orchestrate all pipeline steps with completion markers (FORCE=1 re-runs everything).
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

step() { # step <marker> <cmd…>
  local marker="$WORK/.done-$1"; shift
  if [ -f "$marker" ] && [ "${FORCE:-0}" != 1 ]; then
    log "skip $(basename "$marker") (done)"
    return 0
  fi
  local t0=$SECONDS
  "$@"
  touch "$marker"
  log "step $(basename "$marker" | sed 's/^\.done-//') finished in $((SECONDS - t0))s"
}

step extras   bash "$SRC/00-download-extras.sh"
step gpkg     bash "$SRC/01-osm-to-gpkg.sh"
step extract  bash "$SRC/02-extract-layers.sh"
step curated  node "$SRC/03-curated.mjs"
step shape    bash "$SRC/04-shape.sh"
step terrain  bash "$SRC/05-terrain.sh"
step bathy    bash "$SRC/05b-bathymetry.sh"
node "$SRC/06-manifest.mjs"

log "pipeline complete ✓"
