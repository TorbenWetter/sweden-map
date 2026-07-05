#!/usr/bin/env bash
# The cartographic shaping stage: clip to Sweden, compute areas/lengths, filter,
# dissolve for SVG efficiency, simplify into two tiers, emit TopoJSON.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

MS="$MAPSHAPER"
FRAME_BBOX="$FRAME_XMIN,$FRAME_YMIN,$FRAME_XMAX,$FRAME_YMAX"

tier() { # tier <name> → interval for that tier
  if [ "$1" = print ]; then echo "$INTERVAL_PRINT"; else echo "$INTERVAL_PREVIEW"; fi
}

# --- land: merge the artificial split-grid tiles once, then per-tier simplify + split ---
if [ ! -f "$WORK/land-merged.geojson" ]; then
  log "land: dissolving split-grid tiles (one-time, a few minutes)…"
  "$MS" "$WORK/land.geojson" -clip bbox=$FRAME_BBOX -dissolve2 -o "$WORK/land-merged.geojson"
fi

for T in print preview; do
  IV=$(tier $T)
  MIN_ISLAND=$([ "$T" = print ] && echo 500000 || echo 4000000)   # m²
  log "land ($T, interval=${IV}m)…"
  "$MS" "$WORK/land-merged.geojson" \
    -simplify weighted interval=$IV keep-shapes \
    -filter-islands min-area=$MIN_ISLAND \
    -o "$WORK/land.$T.geojson"

  "$MS" "$WORK/land.$T.geojson" -clip "$WORK/sweden0.geojson" \
    -o format=topojson "$OUT/sweden.$T.json"
  "$MS" "$WORK/land.$T.geojson" -erase "$WORK/sweden0.geojson" \
    -o format=topojson "$OUT/neighbors.$T.json"
done

# --- admin boundaries (rendered as interior meshes in the app) ---
for T in print preview; do
  IV=$(tier $T)
  log "admin boundaries ($T)…"
  "$MS" "$WORK/lan.geojson" -simplify weighted interval=$IV keep-shapes \
    -filter-fields name,ref -o format=topojson "$OUT/lan.$T.json"
  "$MS" "$WORK/kommun.geojson" -simplify weighted interval=$IV keep-shapes \
    -filter-fields name -o format=topojson "$OUT/kommun.$T.json"
done

# --- lakes: area attribute → filter ≥1 km² ---
# Second clip (by land) drops sea bays that OSM tags natural=water without water=lake:
# real lakes lie inside the landmass, bays lie outside it.
for T in print preview; do
  IV=$(tier $T)
  log "lakes ($T)…"
  "$MS" "$WORK/lakes.geojson" \
    -clip "$WORK/sweden0.geojson" \
    -clip "$WORK/land.$T.geojson" \
    -each 'area_km2=Math.round(this.area/1e4)/100' \
    -filter 'area_km2>=1' \
    -simplify weighted interval=$IV keep-shapes \
    -filter-fields name,area_km2 \
    -o format=topojson "$OUT/lakes.$T.json"
done

# --- rivers: merge per name, length filter ---
for T in print preview; do
  IV=$(tier $T)
  log "rivers ($T)…"
  "$MS" "$WORK/rivers.geojson" \
    -clip "$WORK/sweden0.geojson" \
    -dissolve fields=name \
    -each 'length_km=Math.round(this.length/100)/10' \
    -filter 'length_km>=30' \
    -simplify weighted interval=$IV \
    -filter-fields name,length_km \
    -o format=topojson "$OUT/rivers.$T.json"
done

# --- roads: dissolve per class → 4 giant features, cheap to render & toggle ---
for T in print preview; do
  IV=$(tier $T)
  log "roads ($T)…"
  "$MS" "$WORK/roads.geojson" \
    -clip "$WORK/sweden0.geojson" \
    -dissolve fields=class \
    -simplify weighted interval=$IV \
    -filter-fields class \
    -o format=topojson "$OUT/roads.$T.json"
done

# --- railways: normalize usage, dissolve → 2 features ---
for T in print preview; do
  IV=$(tier $T)
  log "railways ($T)…"
  "$MS" "$WORK/railways.geojson" \
    -clip "$WORK/sweden0.geojson" \
    -each 'usage=usage||"main"' \
    -dissolve fields=usage \
    -simplify weighted interval=$IV \
    -filter-fields usage \
    -o format=topojson "$OUT/railways.$T.json"
done

# --- parks: national parks all, nature reserves only if large ---
for T in print preview; do
  IV=$(tier $T)
  log "parks ($T)…"
  "$MS" "$WORK/parks.geojson" \
    -clip "$WORK/sweden0.geojson" \
    -each 'area_km2=Math.round(this.area/1e4)/100' \
    -filter 'kind=="national_park" || area_km2>=50' \
    -simplify weighted interval=$IV keep-shapes \
    -filter-fields name,kind,area_km2 \
    -o format=topojson "$OUT/parks.$T.json"
done

# --- waterlines: concentric coastal rings (vintage/etching looks), buffered seaward ---
log "waterlines…"
WL_DISTS=(1600 3400 5600 8200)
WL_FILES=()
for i in "${!WL_DISTS[@]}"; do
  D=${WL_DISTS[$i]}
  RING=$((i + 1))
  ogr2ogr -f GeoJSON "$WORK/waterline_$RING.geojson" "$WORK/land.preview.geojson" \
    -dialect sqlite -sql "SELECT $RING AS ring, ST_Boundary(ST_Buffer(geometry, $D)) AS geometry FROM \"land.preview\""
  WL_FILES+=("$WORK/waterline_$RING.geojson")
done
"$MS" -i "${WL_FILES[@]}" combine-files \
  -merge-layers force \
  -clip bbox=$FRAME_BBOX \
  -simplify weighted interval=250 \
  -o format=topojson "$OUT/waterlines.json"

# --- ferries: sea lanes, so clip to frame (not the country); drop tiny cable ferries ---
log "ferries…"
# unnamed routes keep a unique key — a plain name-dissolve would fuse them into one
# giant feature that smuggles tiny cable ferries past the length filter
"$MS" "$WORK/ferries.geojson" \
  -clip bbox=$FRAME_BBOX \
  -each 'key=name || "u" + this.id' \
  -dissolve fields=key copy-fields=name \
  -each 'length_km=Math.round(this.length/100)/10' \
  -filter 'length_km>=8' \
  -simplify weighted interval=300 \
  -filter-fields name,length_km \
  -o format=topojson "$OUT/ferries.json"

# --- hiking trails: route relations, national (nwn) and regional (rwn) ---
# Long trails are stage relations ("Kungsleden Etapp 25: …") — strip the stage
# suffix before dissolving so stages fuse into their parent trail.
log "trails…"
"$MS" "$WORK/trails.geojson" \
  -clip "$WORK/sweden0.geojson" \
  -each 'name=(name||"").replace(/\s+(etapp|stage|etappe|del|avsnitt)\b[\s\S]*$/i,"").replace(/[\s:,-]+$/,"")||null' \
  -each 'key=name || "u" + this.id' \
  -dissolve fields=key copy-fields=name,network \
  -each 'length_km=Math.round(this.length/100)/10' \
  -filter 'length_km>=40' \
  -simplify weighted interval=200 \
  -filter-fields name,network,length_km \
  -o format=topojson "$OUT/trails.json"

# --- icon layers: lighthouses, IATA airports, castles (points; polygons -> centroids) ---
log "icons…"
"$MS" "$WORK/lighthouses.geojson" -clip "$WORK/sweden0.geojson" \
  -filter 'name != null' \
  -filter-fields name -o format=topojson "$OUT/lighthouses.json"

# point sources listed first so -uniq prefers them over polygon centroids
"$MS" "$WORK/airports_poly.geojson" -points -o "$WORK/airports_polypt.geojson"
"$MS" -i "$WORK/airports_pt.geojson" "$WORK/airports_polypt.geojson" combine-files \
  -merge-layers force \
  -clip "$WORK/sweden0.geojson" \
  -uniq iata \
  -filter-fields name,iata \
  -o format=topojson "$OUT/airports.json"

"$MS" "$WORK/castles_poly.geojson" -points -o "$WORK/castles_polypt.geojson"
"$MS" -i "$WORK/castles_pt.geojson" "$WORK/castles_polypt.geojson" combine-files \
  -merge-layers force \
  -clip "$WORK/sweden0.geojson" \
  -filter 'name != null' \
  -uniq name \
  -filter-fields name \
  -o format=topojson "$OUT/castles.json"

# --- point/line layers without tiers ---
log "places, graticule, ne borders, labels…"
"$MS" "$WORK/places.geojson" -clip "$WORK/sweden0.geojson" \
  -each 'population=population||0' \
  -o format=topojson "$OUT/places.json"
"$MS" "$WORK/graticule.geojson" -clip bbox=$FRAME_BBOX \
  -o format=topojson "$OUT/graticule.json"
"$MS" "$WORK/ne_borders.geojson" -clip bbox=$FRAME_BBOX \
  -o format=topojson "$OUT/ne-borders.json"
"$MS" "$WORK/sealabels.geojson" -o format=topojson "$OUT/sea-labels.json"
"$MS" "$WORK/neighborplaces.geojson" -o format=topojson "$OUT/neighbor-places.json"

log "shaping done → $OUT"
