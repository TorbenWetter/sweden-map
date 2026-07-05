#!/usr/bin/env bash
# Filter the raw pbf into a small GeoPackage with only the feature classes we need.
# (Filtering here keeps buildings/landuse/etc. out — the gpkg stays ~100× smaller.)
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

PBF="$RAW/$PBF_FILE"
GPKG="$WORK/osm.gpkg"
rm -f "$GPKG"

export OSM_MAX_TMPFILE_SIZE=4000

log "pbf → gpkg: places (points)…"
ogr2ogr -f GPKG "$GPKG" "$PBF" points \
  -where "place IN ('city','town')" -nln places_raw

log "pbf → gpkg: transport + rivers (lines)…"
ogr2ogr -f GPKG -update "$GPKG" "$PBF" lines \
  -where "highway IN ('motorway','trunk','primary','secondary') OR railway = 'rail' OR waterway = 'river'" \
  -nln lines_raw

log "pbf → gpkg: admin/water/parks (multipolygons)…"
ogr2ogr -f GPKG -update "$GPKG" "$PBF" multipolygons \
  -where "boundary IN ('administrative','national_park') OR \"natural\" = 'water' OR leisure = 'nature_reserve'" \
  -nln polys_raw

log "gpkg written: $(du -h "$GPKG" | cut -f1)"
