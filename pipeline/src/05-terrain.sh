#!/usr/bin/env bash
# Copernicus GLO-90 DEM → multidirectional hillshade PNGs (preview + print).
# Normalized so flat ground = white → safe to composite with 'multiply'.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

DEM_DIR="$RAW/dem"
mkdir -p "$DEM_DIR"

# The projected frame spans ~3–31°E across its latitude range — sweep wide; sea tiles 404 cheaply.
log "probing + fetching GLO-90 tiles (lat 54–69, lon 3–31)…"
URL_LIST="$WORK/dem-urls.txt"
: > "$URL_LIST"
for LAT in $(seq 54 69); do
  for LON in $(seq 3 31); do
    LON3=$(printf '%03d' "$LON")
    NAME="Copernicus_DSM_COG_30_N${LAT}_00_E${LON3}_00_DEM"
    echo "https://copernicus-dem-90m.s3.amazonaws.com/${NAME}/${NAME}.tif" >> "$URL_LIST"
  done
done
DEM_DIR="$DEM_DIR" xargs -n 1 -P 8 bash "$SRC/fetch-dem-tile.sh" < "$URL_LIST" || true
COUNT=$(ls "$DEM_DIR"/*.tif 2>/dev/null | wc -l | tr -d ' ')
log "have $COUNT DEM tiles"
[ "$COUNT" -gt 0 ] || { log "no DEM tiles — skipping terrain"; exit 0; }

log "building VRT + warping to EPSG:3006 @120 m…"
gdalbuildvrt -q "$WORK/dem.vrt" "$DEM_DIR"/*.tif
gdalwarp -q -overwrite -t_srs EPSG:3006 \
  -te $FRAME_XMIN $FRAME_YMIN $FRAME_XMAX $FRAME_YMAX \
  -tr 120 120 -r bilinear -co COMPRESS=DEFLATE -co TILED=YES \
  "$WORK/dem.vrt" "$WORK/dem3006.tif"

log "hillshading…"
gdaldem hillshade -q -multidirectional -z 4.5 -alt 35 -compute_edges \
  "$WORK/dem3006.tif" "$WORK/hillshade-raw.tif" -co COMPRESS=DEFLATE

# Multidirectional hillshade renders flat terrain ≈181; stretch so flat → 255 (no-op under multiply).
gdal_translate -q -ot Byte -scale 0 181 0 255 "$WORK/hillshade-raw.tif" "$WORK/hillshade.tif" -co COMPRESS=DEFLATE

log "exporting PNGs…"
gdal_translate -q -of PNG -outsize 0 2000 "$WORK/hillshade.tif" "$OUT/hillshade-preview.png"
gdal_translate -q -of PNG -outsize 0 9600 "$WORK/hillshade.tif" "$OUT/hillshade-print.png"
rm -f "$OUT"/hillshade-*.png.aux.xml

log "terrain done."
