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
  -where "place IN ('city','town') OR man_made = 'lighthouse' OR other_tags LIKE '%\"aeroway\"=>\"aerodrome\"%' OR other_tags LIKE '%\"historic\"=>\"castle\"%'" \
  -nln places_raw

log "pbf → gpkg: transport + rivers + ferries (lines)…"
ogr2ogr -f GPKG -update "$GPKG" "$PBF" lines \
  -where "highway IN ('motorway','trunk','primary','secondary') OR railway = 'rail' OR waterway = 'river' OR other_tags LIKE '%\"route\"=>\"ferry\"%'" \
  -nln lines_raw

log "pbf → gpkg: admin/water/parks (multipolygons)…"
ogr2ogr -f GPKG -update "$GPKG" "$PBF" multipolygons \
  -where "boundary IN ('administrative','national_park') OR \"natural\" = 'water' OR leisure = 'nature_reserve' OR aeroway = 'aerodrome' OR historic = 'castle'" \
  -nln polys_raw

log "pbf → gpkg: hiking route relations (multilinestrings)…"
ogr2ogr -f GPKG -update "$GPKG" "$PBF" multilinestrings \
  -where "type = 'route' AND other_tags LIKE '%\"route\"=>\"hiking\"%'" \
  -nln routes_raw

log "gpkg written: $(du -h "$GPKG" | cut -f1)"
