// Build app/public/data/manifest.json: layer inventory, bounds, country metadata,
// attribution. The app learns everything country-specific from this file.
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './load-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'app', 'public', 'data');

const FRAME = config.frame;

const info = (file) => {
  const p = join(OUT, file);
  if (!existsSync(p)) return null;
  const topo = JSON.parse(readFileSync(p, 'utf8'));
  const objects = Object.values(topo.objects ?? {});
  const features = objects.reduce((n, o) => n + (o.geometries?.length ?? 0), 0);
  return { file, bytes: statSync(p).size, features, bbox: topo.bbox ?? null };
};

const tiered = (id, opts = {}) => {
  const preview = info(`${id}.preview.json`);
  const print = info(`${id}.print.json`);
  return preview && print ? { tiered: true, ...opts, preview, print } : null;
};
const single = (id, file, opts = {}) => {
  const i = info(file);
  return i ? { tiered: false, ...opts, preview: i, print: i } : null;
};

const layers = {
  bathymetry: single('bathymetry', 'bathymetry.json'),
  contours: tiered('contours'),
  sweden: tiered('sweden'),
  neighbors: tiered('neighbors'),
  lan: tiered('lan', { mesh: true }),
  kommun: tiered('kommun', { mesh: true }),
  lakes: tiered('lakes'),
  rivers: tiered('rivers'),
  roads: tiered('roads'),
  railways: tiered('railways'),
  parks: tiered('parks'),
  waterlines: single('waterlines', 'waterlines.json'),
  ferries: single('ferries', 'ferries.json'),
  trails: single('trails', 'trails.json'),
  places: single('places', 'places.json'),
  graticule: single('graticule', 'graticule.json'),
  neBorders: single('neBorders', 'ne-borders.json'),
  seaLabels: single('seaLabels', 'sea-labels.json'),
  neighborPlaces: single('neighborPlaces', 'neighbor-places.json'),
};

const swedenBounds = layers.sweden?.print?.bbox ?? [FRAME.xmin, FRAME.ymin, FRAME.xmax, FRAME.ymax];

const hillshade = existsSync(join(OUT, 'hillshade-preview.png'))
  ? {
      bounds: FRAME,
      preview: { file: 'hillshade-preview.png', bytes: statSync(join(OUT, 'hillshade-preview.png')).size },
      print: { file: 'hillshade-print.png', bytes: statSync(join(OUT, 'hillshade-print.png')).size },
    }
  : null;

const manifest = {
  manifestVersion: 2,
  generatedAt: new Date().toISOString(),
  country: { name: config.name, code: config.code },
  epsg: config.epsg,
  crsLabel: config.crsLabel,
  locale: config.locale,
  frame: FRAME,
  swedenBounds,
  placePriority: config.placePriority,
  layerLabels: config.layerLabels,
  legendLabels: config.legendLabels,
  layers,
  hillshade,
  attribution: [
    '© OpenStreetMap contributors (ODbL)',
    ...(hillshade ? ['Terrain: Copernicus DEM © ESA'] : []),
    ...(layers.bathymetry ? ['Bathymetry: NOAA ETOPO 2022'] : []),
    'Natural Earth',
  ],
};

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[pipeline] manifest.json written.');
for (const [id, t] of Object.entries(layers)) {
  if (!t || !t.preview) { console.log(`  ${id}: MISSING`); continue; }
  console.log(`  ${id}: preview ${(t.preview.bytes / 1e6).toFixed(1)} MB / ${t.preview.features} feats · print ${(t.print.bytes / 1e6).toFixed(1)} MB / ${t.print.features} feats`);
}
