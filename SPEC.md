# Sweden Map Studio — Specification

A local-first web app for designing a fully custom, print-ready poster map of Sweden:
every layer live-adjustable, every design saved as a reproducible JSON *recipe*,
exported as true-vector SVG/PDF at exact physical size.

Decided 2026-07-04 in an interactive spec session. All options below were chosen
explicitly by Torben (each was also the recommendation).

## Locked decisions

| Decision | Choice |
|---|---|
| Approach | Interactive web app (Vite + React + TypeScript + D3-geo, real SVG) with a scripted one-time data pipeline |
| Data | OpenStreetMap (Geofabrik Sweden extract + osmdata land polygons) + Natural Earth accents; schema leaves a slot for Lantmäteriet GeoPackages later |
| Extras | Terrain relief (subtle hillshade underlay, Copernicus DEM 90 m), national parks, neighbor-country context, map furniture |
| Default print target | A1 portrait 594×841 mm (≈1:2M for Sweden); paper size fully adjustable in-app |
| Default style preset | **Nordic minimal** (paper-white land, pale blue sea, falu-red transport accent); Classic topographic / Dark poster / Vintage atlas ship as switchable presets |
| Labels | Auto-placement (population-ranked, collision-avoiding) + drag-to-fine-tune; offsets stored in the recipe |
| Terrain default | Subtle underlay ~15 % opacity, 0–100 % slider, excludable from export for pure vector |
| Projection | SWEREF99 TM (EPSG:3006), data pre-projected in the pipeline; app renders planar with `geoIdentity().reflectY(true)` |
| Place names | Swedish (Göteborg, not Gothenburg) |
| Export | SVG (primary, Illustrator/Inkscape-safe: inline attributes, no CSS classes) · vector PDF via exact-`@page` print route · PNG at 150/300 dpi |

## Repository layout

```
sweden-map/
├── SPEC.md
├── pnpm-workspace.yaml
├── pipeline/            # Node + shell scripts; deps: mapshaper. System dep: GDAL (brew)
│   ├── src/…            # download → extract → shape → simplify → terrain → manifest
│   └── package.json
├── data/
│   ├── raw/             # downloads (gitignored): sweden-latest.osm.pbf, land-polygons, NE, DEM tiles
│   └── work/            # intermediates (gitignored)
└── app/                 # Vite + React + TS
    ├── public/data/     # final TopoJSON + hillshade PNGs + manifest.json (gitignored, regenerable)
    └── src/
        ├── map/         # projection fit, per-layer SVG renderers, label placement
        ├── state/       # zustand recipe store (+ undo), recipe schema & migration
        ├── presets/     # nordic.ts, topo.ts, dark.ts, vintage.ts
        ├── export/      # SVG serializer, PNG rasterizer, print route
        └── ui/          # panels: layers, style inspector, paper, furniture, export
```

## Data pipeline (one-time, re-runnable)

Sources & licenses:
- **Geofabrik `sweden-latest.osm.pbf`** (~800 MB) — OSM, ODbL → attribution line on poster (default on).
- **osmdata.openstreetmap.de `land-polygons-split-4326`** — assembled OSM coastline; archipelago detail.
- **Natural Earth 10 m** `admin_0_boundary_lines_land` — neighbor national borders (public domain).
- **Copernicus DEM GLO-90** via public S3 (`copernicus-dem-90m`) — hillshade (free, attribution line).
- *(later, optional)* Lantmäteriet Topografi 1M/250 GeoPackage (CC0) via Geotorget → drop-in replacement for borders/rail.

Layer extraction (ogr2ogr from the pbf with a custom `osmconf.ini`, then mapshaper):

| Layer | Source filter | Kept attributes |
|---|---|---|
| `sweden` (land) | land polygons ∩ Sweden admin-0 (OSM rel, `admin_level=2`) | — |
| `neighbors` | land polygons ∖ Sweden, clipped to frame bbox | — |
| `lan` (21 counties) | `boundary=administrative`, `admin_level=4` | `name`, `ref` |
| `kommun` (290) | `admin_level=7` | `name` |
| `lakes` | `natural=water` / `water=lake\|reservoir`, area ≥ 1 km² | `name`, `area_km2` |
| `rivers` | `waterway=river`, merged per name, length ≥ 30 km | `name`, `length_km` |
| `roads` | `highway ∈ motorway,trunk,primary,secondary` (no links) | `class`, `ref` |
| `railways` | `railway=rail`, `usage ∈ main,branch` (or usage null & no `service`) | `usage` |
| `parks` | `boundary=national_park` (+ nature reserves ≥ 50 km², flagged) | `name`, `kind`, `area_km2` |
| `places` | `place ∈ city,town` | `name`, `population`, `capital`, curated `residensstad` flag |
| `graticule` | generated 1° WGS84 grid, projected to 3006 | `axis`, `deg` |
| `neighbor-places` | curated: Oslo, Helsingfors, København, Tromsø… | `name` |
| `water-labels` | curated: Östersjön, Bottenviken, Bottenhavet, Kattegatt, Skagerrak, Vänern, Vättern, Mälaren… | `name`, `kind` |

Processing: everything → EPSG:3006 → mapshaper visvalingam-weighted simplification in **two tiers**
(`preview` aggressive for a fluid UI, `print` fine for export) → TopoJSON per layer per tier →
`app/public/data/manifest.json` records extents, tiers, feature counts, attribution strings.
Borders render as TopoJSON *meshes* (shared arcs → interior lines drawn once).

Terrain: probe & fetch GLO-90 tiles covering lon 10–25° / lat 55–69.5°, `gdalbuildvrt` →
`gdalwarp` to EPSG:3006 @ 90 m → `gdaldem hillshade -multidirectional` → grayscale PNGs:
`hillshade-preview.png` (~1800 px tall) and `hillshade-print.png` (~9000 px tall ≈ 290 dpi on A1),
plus its projected bounds in the manifest. Rendered as an SVG `<image>` with opacity control.

## The app

**Stack**: Vite, React 18, TypeScript, `d3-geo` (paths only), `topojson-client`, `zustand` (+`zundo` undo),
`@dnd-kit` (layer reorder). No UI framework — hand-rolled panel CSS (this is a design tool; it should look like one).

**Recipe** (single JSON document, the unit of reproducibility):
```ts
{ version: 1, name, preset,
  paper: { wMm, hMm, marginMm, background },      // A1 default
  view:  { fitMode: 'height', center?, scale? },
  layers: LayerState[],                            // ordered bottom→top
  labels: { citiesMinPop, rules, overrides: { [id]: {dxMm, dyMm, hidden?, anchor?} } },
  furniture: { title: {text:'SVERIGE', sub, x,y, font, tracking}, legend, scalebar, north, graticule, attribution } }
```
`LayerState` = `{ id, visible, opacity, style (fill/stroke/widthMm/dash/…), filters }` where filters are
layer-specific: road classes on/off, lake `minAreaKm2`, city `minPopulation`, park kinds, rail usage.
Recipes: autosaved to localStorage, import/export as `.json` files, preset switch = load preset then diff-preserve paper.

**Rendering**: one `<svg>` sized in real mm (`width="594mm"` + matching `viewBox`), layers as `<g>` in recipe
order; path `d` strings memoized per (layer, tier, filter) so style tweaks are attribute-only updates.
Pan/zoom on a wrapper transform (`d3-zoom`), paper-true; UI chrome outside the artboard. Preview tier while
interacting, print tier for export.

**Labels**: canvas-measured text boxes, priority = population rank (residensstäder boosted); greedy placement
over 8 anchor candidates; drag any label in “label edit” mode → `overrides` in recipe; leader line when
displaced beyond threshold. Lake/sea labels italic, tracked.

**Furniture**: title block, legend (auto-built from visible layers), scale bar (correct from projection fit),
north arrow, graticule ticks, attribution (“© OpenStreetMap contributors · Copernicus DEM” — toggleable).

**Export**:
- **SVG** — serialize a clean print-tier render (inline style attributes, mm dimensions, no interactivity).
- **PDF** — `/print` route rendering the artboard 1:1 with `@page { size: <w>mm <h>mm; margin: 0 }` → browser print dialog → vector PDF.
- **PNG** — offscreen rasterization of the export SVG at 150/300 dpi.
- Toggle: include raster hillshade (embedded high-DPI image) or export pure vector.

## Presets (all four ship; Nordic minimal is default)

| | land | sea | lakes | neighbors | län | roads | rail | parks | labels |
|---|---|---|---|---|---|---|---|---|---|
| **Nordic minimal** | `#F7F5F0` | `#DDE8EE` | `#C2D8E4` | `#ECEAE5` | `#9AA0A8` | `#B9553F` | `#2E3440` dash | `#DCE5D4` | `#2E3440` airy |
| Classic topo | `#EEF0DE` | `#A9D2E2` | `#8FC4DA` | `#E6E3D8` | `#6B6F76` | class ramp | `#1A1A1A` ticks | `#BFD9A8` | `#1A1A1A` |
| Dark poster | `#171C24` | `#0B0E13` | `#0B0E13` | `#12151B` | `#3A4250` | `#FFB454` | `#7FD1D9` | `#1E2A22` | `#E6E9EE` |
| Vintage atlas | `#F3EAD8` | `#C9D8D2` | `#B7CCC9` | `#EAE0CC` | `#6E5B44` | `#A6503C` | `#3F352A` | `#CDD4B2` | `#3F352A` serif |

## Scope

**v1 (this build)**: pipeline end-to-end · all layers rendered · layer panel (visibility/color/width/opacity/
order/filters) · 4 presets · auto+draggable labels · furniture · terrain underlay · recipe save/load ·
SVG + PDF + PNG export.

**Later**: text-to-path conversion for foolproof Illustrator handoff (opentype.js) · Lantmäteriet layer swap ·
secondary/tertiary road tiers · tätort polygons (SCB) · deploy static build · custom label styling per feature.

## Running

```bash
brew install gdal                     # one-time system dep
pnpm install
pnpm pipeline                         # downloads (~1.7 GB) + processes (~20–30 min, resumable)
pnpm dev                              # → http://localhost:5173
```
