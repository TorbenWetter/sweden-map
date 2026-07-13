#!/usr/bin/env bash
# Extract themed layers from the gpkg (SQLite dialect; OSM extras live in the
# other_tags hstore) and project everything to EPSG:3006. Also subsets the
# land polygons + Natural Earth lines to our frame.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

GPKG="$WORK/osm.gpkg"
X() { # X <out-name> <ogr2ogr args…>
  local out="$WORK/$1.geojson"; shift
  rm -f "$out"
  ogr2ogr -f GeoJSON "$out" "$@" -t_srs "EPSG:$EPSG"
  log "extracted $(basename "$out")"
}

# double any apostrophes for the SQLite literal (Côte d'Ivoire etc.)
OSM_COUNTRY_NAME_SQL=${OSM_COUNTRY_NAME//\'/\'\'}

X sweden0 "$GPKG" -dialect sqlite -sql \
  "SELECT geom FROM polys_raw WHERE boundary='administrative' AND admin_level='$ADMIN_COUNTRY' AND name='$OSM_COUNTRY_NAME_SQL'" \
  -nlt PROMOTE_TO_MULTI -makevalid

X lan "$GPKG" -dialect sqlite -sql \
  "SELECT name, hstore_get_value(other_tags,'ref') AS ref, geom FROM polys_raw
   WHERE boundary='administrative' AND admin_level='$ADMIN1'" \
  -nlt PROMOTE_TO_MULTI -makevalid

X kommun "$GPKG" -dialect sqlite -sql \
  "SELECT name, geom FROM polys_raw WHERE boundary='administrative' AND admin_level='$ADMIN2'" \
  -nlt PROMOTE_TO_MULTI -makevalid

X lakes "$GPKG" -dialect sqlite -sql \
  "SELECT name, geom FROM polys_raw
   WHERE \"natural\"='water'
     AND (hstore_get_value(other_tags,'water') IS NULL
          OR hstore_get_value(other_tags,'water') IN ('lake','reservoir'))" \
  -nlt PROMOTE_TO_MULTI -makevalid

X parks "$GPKG" -dialect sqlite -sql \
  "SELECT name,
          CASE WHEN boundary='national_park' THEN 'national_park' ELSE 'nature_reserve' END AS kind,
          geom
   FROM polys_raw WHERE boundary='national_park' OR leisure='nature_reserve'" \
  -nlt PROMOTE_TO_MULTI -makevalid

X rivers "$GPKG" -dialect sqlite -sql \
  "SELECT name, geom FROM lines_raw WHERE waterway='river'"

X roads "$GPKG" -dialect sqlite -sql \
  "SELECT highway AS class, hstore_get_value(other_tags,'ref') AS ref, geom
   FROM lines_raw WHERE highway IN ('motorway','trunk','primary','secondary')"

X railways "$GPKG" -dialect sqlite -sql \
  "SELECT * FROM (
     SELECT hstore_get_value(other_tags,'usage')   AS usage,
            hstore_get_value(other_tags,'service') AS service, geom
     FROM lines_raw WHERE railway='rail')
   WHERE usage IN ('main','branch') OR (usage IS NULL AND service IS NULL)"

X ferries "$GPKG" -dialect sqlite -sql \
  "SELECT name, geom FROM lines_raw WHERE hstore_get_value(other_tags,'route')='ferry'"

X trails "$GPKG" -dialect sqlite -sql \
  "SELECT name, hstore_get_value(other_tags,'network') AS network, geom FROM routes_raw
   WHERE hstore_get_value(other_tags,'route')='hiking'
     AND hstore_get_value(other_tags,'network') IN ('nwn','rwn')"

X lighthouses "$GPKG" -dialect sqlite -sql \
  "SELECT name, geom FROM places_raw WHERE man_made='lighthouse'"

X airports_pt "$GPKG" -dialect sqlite -sql \
  "SELECT name, hstore_get_value(other_tags,'iata') AS iata, geom FROM places_raw
   WHERE hstore_get_value(other_tags,'aeroway')='aerodrome' AND hstore_get_value(other_tags,'iata') IS NOT NULL"

X airports_poly "$GPKG" -dialect sqlite -sql \
  "SELECT name, hstore_get_value(other_tags,'iata') AS iata, geom FROM polys_raw
   WHERE aeroway='aerodrome' AND hstore_get_value(other_tags,'iata') IS NOT NULL"

# historic=castle is a broad church: it also covers manor houses, vanished ruins and
# (verbatim, near Sundsvall) two cannons and a street address. Carry the tags that tell
# them apart — castle_type splits manor from castle, and a footprint or a Wikidata entry
# is what separates a real site from a stray node. 04-shape.sh does the filtering.
X castles_pt "$GPKG" -dialect sqlite -sql \
  "SELECT name,
          hstore_get_value(other_tags,'castle_type') AS castle_type,
          CASE WHEN hstore_get_value(other_tags,'wikidata') IS NOT NULL
                 OR hstore_get_value(other_tags,'wikipedia') IS NOT NULL THEN 1 ELSE 0 END AS cited,
          0 AS mapped_area,
          geom
   FROM places_raw WHERE hstore_get_value(other_tags,'historic')='castle'"

X castles_poly "$GPKG" -dialect sqlite -sql \
  "SELECT name,
          hstore_get_value(other_tags,'castle_type') AS castle_type,
          CASE WHEN hstore_get_value(other_tags,'wikidata') IS NOT NULL
                 OR hstore_get_value(other_tags,'wikipedia') IS NOT NULL THEN 1 ELSE 0 END AS cited,
          1 AS mapped_area,
          geom
   FROM polys_raw WHERE historic='castle'"

X places "$GPKG" -dialect sqlite -sql \
  "SELECT name, place,
          CAST(hstore_get_value(other_tags,'population') AS INTEGER) AS population,
          hstore_get_value(other_tags,'capital') AS capital, geom
   FROM places_raw WHERE place IN ('city','town') AND name IS NOT NULL"

log "land polygons subset (this one takes a few minutes)…"
rm -f "$WORK/land.geojson"
ogr2ogr -f GeoJSON "$WORK/land.geojson" "$RAW/land-polygons-split-4326/land_polygons.shp" \
  -spat $FRAME4326 -clipsrc $FRAME4326 -t_srs "EPSG:$EPSG" -makevalid

rm -f "$WORK/ne_borders.geojson"
ogr2ogr -f GeoJSON "$WORK/ne_borders.geojson" "$RAW/ne_borders/ne_10m_admin_0_boundary_lines_land.shp" \
  -spat $FRAME4326 -clipsrc $FRAME4326 -t_srs "EPSG:$EPSG"

log "layer extraction done."
