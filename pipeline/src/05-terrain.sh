#!/usr/bin/env bash
# Copernicus GLO-90 DEM → multidirectional hillshade PNGs (preview + print).
# Normalized so flat ground = white → safe to composite with 'multiply'.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

DEM_DIR="$RAW/dem"
mkdir -p "$DEM_DIR"

# The projected frame spans far wider in lon than the country itself — sweep per config; sea tiles 404 cheaply.
log "probing + fetching GLO-90 tiles (lat ${DEM_LAT_MIN}-${DEM_LAT_MAX}, lon ${DEM_LON_MIN}-${DEM_LON_MAX})..."
URL_LIST="$WORK/dem-urls.txt"
: > "$URL_LIST"
for LAT in $(seq "$DEM_LAT_MIN" "$DEM_LAT_MAX"); do
  for LON in $(seq "$DEM_LON_MIN" "$DEM_LON_MAX"); do
    LON3=$(printf '%03d' "$LON")
    NAME="Copernicus_DSM_COG_30_N${LAT}_00_E${LON3}_00_DEM"
    echo "https://copernicus-dem-90m.s3.amazonaws.com/${NAME}/${NAME}.tif" >> "$URL_LIST"
  done
done
DEM_DIR="$DEM_DIR" xargs -n 1 -P 8 bash "$SRC/fetch-dem-tile.sh" < "$URL_LIST" || true
COUNT=$(ls "$DEM_DIR"/*.tif 2>/dev/null | wc -l | tr -d ' ')
log "have $COUNT DEM tiles"
[ "$COUNT" -gt 0 ] || { log "no DEM tiles — skipping terrain"; exit 0; }

log "building VRT + warping to EPSG:$EPSG @120 m…"
gdalbuildvrt -q "$WORK/dem.vrt" "$DEM_DIR"/*.tif
gdalwarp -q -overwrite -t_srs "EPSG:$EPSG" \
  -te $FRAME_XMIN $FRAME_YMIN $FRAME_XMAX $FRAME_YMAX \
  -tr 120 120 -r bilinear -co COMPRESS=DEFLATE -co TILED=YES \
  "$WORK/dem.vrt" "$WORK/dem3006.tif"

log "hillshading…"
gdaldem hillshade -q -multidirectional -z 4.5 -alt 35 -compute_edges \
  "$WORK/dem3006.tif" "$WORK/hillshade-raw.tif" -co COMPRESS=DEFLATE

# Multidirectional hillshade renders flat terrain ≈181; stretch so flat → 255 (no-op under multiply).
gdal_translate -q -ot Byte -scale 0 181 0 255 "$WORK/hillshade-raw.tif" "$WORK/hillshade.tif" -co COMPRESS=DEFLATE

# Bake blend math + land clip into alpha PNGs: compositing BLACK with alpha 1−g equals
# multiply(g); compositing WHITE with the same alpha equals screen(1−g). This lets the
# app draw a plain <image> — no blend mode, no invert filter, no giant clipPath — which
# keeps the browser on the GPU fast path (blend+clip cost ~5 s per load) and exports
# cleanly to Illustrator.
log "hillshade alpha variants…"
gdal_rasterize -q -burn 255 -init 0 -ot Byte \
  -te $FRAME_XMIN $FRAME_YMIN $FRAME_XMAX $FRAME_YMAX -tr 120 120 \
  "$WORK/land.preview.geojson" "$WORK/landmask.tif"
gdal_calc.py --quiet --overwrite -A "$WORK/hillshade.tif" -B "$WORK/landmask.tif" \
  --calc="(255-A)*(B/255.0)" --type=Byte --outfile="$WORK/hs-alpha.tif"
gdal_calc.py --quiet --overwrite -A "$WORK/hs-alpha.tif" --calc="A*0" --type=Byte --outfile="$WORK/hs-black.tif"
gdal_calc.py --quiet --overwrite -A "$WORK/hs-alpha.tif" --calc="A*0+255" --type=Byte --outfile="$WORK/hs-white.tif"

log "exporting PNGs…"
for VARIANT in dark light; do
  BAND=$([ "$VARIANT" = dark ] && echo "$WORK/hs-black.tif" || echo "$WORK/hs-white.tif")
  gdal_merge.py -q -separate -o "$WORK/hs-$VARIANT-la.tif" "$BAND" "$WORK/hs-alpha.tif"
  gdal_translate -q -of PNG -outsize 0 2000 "$WORK/hs-$VARIANT-la.tif" "$OUT/hillshade-$VARIANT-preview.png"
  gdal_translate -q -of PNG -outsize 0 9600 "$WORK/hs-$VARIANT-la.tif" "$OUT/hillshade-$VARIANT-print.png"
done
rm -f "$OUT"/hillshade-*.png.aux.xml "$OUT/hillshade-preview.png" "$OUT/hillshade-print.png"

log "contours (200 m base interval)…"
rm -f "$WORK/contours.gpkg" "$WORK/contours.geojson"
gdal_contour -q -i 200 -a elev "$WORK/dem3006.tif" "$WORK/contours.gpkg" -nln contours
# pre-simplify + drop sea level in ogr before the big GeoJSON materializes
ogr2ogr -f GeoJSON "$WORK/contours.geojson" "$WORK/contours.gpkg" contours \
  -where "elev > 0" -simplify 100

for T in print preview; do
  IV=$([ "$T" = print ] && echo 150 || echo 450)
  log "contours ($T)…"
  "$MAPSHAPER" "$WORK/contours.geojson" \
    -simplify weighted interval=$IV \
    -filter-fields elev \
    -o format=topojson "$OUT/contours.$T.json"
done

log "terrain done."
