#!/usr/bin/env bash
# Small extra downloads + unzip of the big ones fetched at session start.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$RAW"

if [ ! -f sweden-latest.osm.pbf ]; then
  log "downloading Geofabrik Sweden extract (~800 MB)…"
  curl -sSL -C - -o sweden-latest.osm.pbf https://download.geofabrik.de/europe/sweden-latest.osm.pbf
fi

if [ ! -f land-polygons-split-4326.zip ]; then
  log "downloading OSM land polygons (~900 MB)…"
  curl -sSL -C - -o land-polygons-split-4326.zip https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
fi

if [ ! -d land-polygons-split-4326 ]; then
  log "unzipping land polygons…"
  unzip -qo land-polygons-split-4326.zip
fi

if [ ! -f ne_10m_admin_0_boundary_lines_land.zip ]; then
  log "downloading Natural Earth boundary lines…"
  curl -sSL -o ne_10m_admin_0_boundary_lines_land.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_boundary_lines_land.zip
fi
if [ ! -f ne_borders/ne_10m_admin_0_boundary_lines_land.shp ]; then
  mkdir -p ne_borders && unzip -qo ne_10m_admin_0_boundary_lines_land.zip -d ne_borders
fi

log "extras ready."
