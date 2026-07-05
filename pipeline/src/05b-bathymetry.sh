#!/usr/bin/env bash
# Baltic bathymetry as vector depth polygons, from NOAA ETOPO 2022 (15 arc-second).
# gdal_contour -p classifies between fixed depth levels; land renders above, so no erase needed.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

ETOPO_DIR="$RAW/etopo"
mkdir -p "$ETOPO_DIR"

# 15° tiles named by their NORTH edge (N60 = lat 45-60); these six cover the frame (lat 45-75, lon 0-45)
TILES=(N60E000 N60E015 N60E030 N75E000 N75E015 N75E030)
BASE="https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/15s/15s_surface_elev_netcdf"

log "fetching ETOPO 2022 tiles…"
FILES=()
for T in "${TILES[@]}"; do
  F="$ETOPO_DIR/ETOPO_2022_v1_15s_${T}_surface.nc"
  if [ ! -s "$F" ]; then
    curl -sf -C - -o "$F.tmp" "$BASE/ETOPO_2022_v1_15s_${T}_surface.nc" && mv "$F.tmp" "$F" || { rm -f "$F.tmp"; log "WARN: tile $T failed"; continue; }
  fi
  FILES+=("$F")
done
[ ${#FILES[@]} -gt 0 ] || { log "no ETOPO tiles — skipping bathymetry"; exit 0; }

log "warping to EPSG:$EPSG @400 m…"
gdalbuildvrt -q "$WORK/etopo.vrt" "${FILES[@]}"
gdalwarp -q -overwrite -t_srs "EPSG:$EPSG" \
  -te $FRAME_XMIN $FRAME_YMIN $FRAME_XMAX $FRAME_YMAX \
  -tr 400 400 -r bilinear -co COMPRESS=DEFLATE \
  "$WORK/etopo.vrt" "$WORK/bathy3006.tif"

log "depth polygons…"
rm -f "$WORK/bathy.gpkg" "$WORK/bathy.geojson"
# NOTE: gdal_contour -p only emits polygons BETWEEN levels — the floor must sit
# below the deepest value in the frame or the abyss gets no polygon at all.
gdal_contour -q -p -amin dmin -amax dmax -fl -6000 -3000 -1000 -500 -200 -100 -50 -20 0 \
  "$WORK/bathy3006.tif" "$WORK/bathy.gpkg" -nln bathy
ogr2ogr -f GeoJSON "$WORK/bathy.geojson" "$WORK/bathy.gpkg" bathy -where "dmax <= 0"

"$MAPSHAPER" "$WORK/bathy.geojson" \
  -each 'depth=Math.round(-dmin)' \
  -filter-fields depth \
  -dissolve2 fields=depth \
  -simplify weighted interval=400 keep-shapes \
  -clean \
  -o format=topojson "$OUT/bathymetry.json"

log "bathymetry done."
