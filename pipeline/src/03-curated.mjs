// Generate curated/synthetic layers as WGS84 GeoJSON, then project to the country
// CRS via ogr2ogr. All content comes from pipeline/country.json.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './load-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = join(ROOT, 'data', 'work');

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coords, properties) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coords } });
const point = ([lon, lat], properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

// --- graticule: config grid, densified so lines curve correctly after projection ---
const g = config.graticule;
const meridians = range(g.lonMin, g.lonMax, g.stepDeg).map((lon) =>
  line(range(g.latMin, g.latMax, g.densifyDeg).map((lat) => [lon, lat]), { axis: 'meridian', deg: lon }));
const parallels = range(g.latMin, g.latMax - 1, g.stepDeg).map((lat) =>
  line(range(g.lonMin - 2, g.lonMax + 1, g.densifyDeg).map((lon) => [lon, lat]), { axis: 'parallel', deg: lat }));
writeFileSync(join(WORK, 'graticule4326.geojson'), JSON.stringify(fc([...meridians, ...parallels])));

// --- curated sea labels ---
writeFileSync(join(WORK, 'sealabels4326.geojson'),
  JSON.stringify(fc(config.seaLabels.map((s) => point([s.lon, s.lat], { name: s.name, kind: 'sea' })))));

// --- curated neighbor cities (ground the map; filtered by frame at runtime) ---
writeFileSync(join(WORK, 'neighborplaces4326.geojson'),
  JSON.stringify(fc(config.neighborPlaces.map((p) => point([p.lon, p.lat], { name: p.name })))));

// --- project all three to the country CRS ---
for (const name of ['graticule', 'sealabels', 'neighborplaces']) {
  execFileSync('ogr2ogr', ['-f', 'GeoJSON', join(WORK, `${name}.geojson`),
    join(WORK, `${name}4326.geojson`), '-t_srs', `EPSG:${config.epsg}`], { stdio: 'inherit' });
}
console.log('[pipeline] curated layers written.');
