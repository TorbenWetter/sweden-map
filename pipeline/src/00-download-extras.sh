#!/usr/bin/env bash
# Downloads: OSM country extract, land polygons, Natural Earth boundary lines.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$RAW"

if [ ! -f "$PBF_FILE" ]; then
  log "downloading OSM extract ($EXTRACT_URL)…"
  curl -sSL -C - -o "$PBF_FILE" "$EXTRACT_URL"
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
