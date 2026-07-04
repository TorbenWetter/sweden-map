// Build app/public/data/manifest.json: layer inventory, bounds, attribution.
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'app', 'public', 'data');

const FRAME = { xmin: 45000, ymin: 6098000, xmax: 1145000, ymax: 7707000 };

const info = (file) => {
  const p = join(OUT, file);
  if (!existsSync(p)) return null;
  const topo = JSON.parse(readFileSync(p, 'utf8'));
  const objects = Object.values(topo.objects ?? {});
  const features = objects.reduce((n, o) => n + (o.geometries?.length ?? 0), 0);
  return { file, bytes: statSync(p).size, features, bbox: topo.bbox ?? null };
};

const tiered = (id) => ({ preview: info(`${id}.preview.json`), print: info(`${id}.print.json`) });
const single = (id, file) => { const i = info(file); return i ? { preview: i, print: i } : null; };

const layers = {
  sweden: tiered('sweden'),
  neighbors: tiered('neighbors'),
  lan: tiered('lan'),
  kommun: tiered('kommun'),
  lakes: tiered('lakes'),
  rivers: tiered('rivers'),
  roads: tiered('roads'),
  railways: tiered('railways'),
  parks: tiered('parks'),
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
  generatedAt: new Date().toISOString(),
  epsg: 3006,
  frame: FRAME,
  swedenBounds,
  layers,
  hillshade,
  attribution: [
    '© OpenStreetMap contributors (ODbL)',
    ...(hillshade ? ['Terrain: Copernicus DEM © ESA'] : []),
    'Natural Earth',
  ],
};

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[pipeline] manifest.json written.');
for (const [id, t] of Object.entries(layers)) {
  if (!t || !t.preview) { console.log(`  ${id}: MISSING`); continue; }
  console.log(`  ${id}: preview ${(t.preview.bytes / 1e6).toFixed(1)} MB / ${t.preview.features} feats · print ${(t.print.bytes / 1e6).toFixed(1)} MB / ${t.print.features} feats`);
}
