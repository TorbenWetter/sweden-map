// Generate curated/synthetic layers as WGS84 GeoJSON, then project to EPSG:3006 via ogr2ogr.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = join(ROOT, 'data', 'work');

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coords, properties) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coords } });
const point = ([lon, lat], properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

// --- graticule: 2° grid, densified so lines curve correctly after projection ---
const meridians = range(4, 32, 2).map((lon) =>
  line(range(54, 71, 0.25).map((lat) => [lon, lat]), { axis: 'meridian', deg: lon }));
const parallels = range(54, 70, 2).map((lat) =>
  line(range(2, 33, 0.25).map((lon) => [lon, lat]), { axis: 'parallel', deg: lat }));
writeFileSync(join(WORK, 'graticule4326.geojson'), JSON.stringify(fc([...meridians, ...parallels])));

// --- curated sea labels (positions chosen for an A1 Sweden frame) ---
const seas = [
  { name: 'Östersjön', lon: 19.1, lat: 56.6 },
  { name: 'Bottenhavet', lon: 19.8, lat: 61.9 },
  { name: 'Bottenviken', lon: 22.6, lat: 64.9 },
  { name: 'Kattegatt', lon: 11.35, lat: 56.9 },
  { name: 'Skagerrak', lon: 9.8, lat: 58.15 },
  { name: 'Ålands hav', lon: 19.4, lat: 60.1 },
];
writeFileSync(join(WORK, 'sealabels4326.geojson'),
  JSON.stringify(fc(seas.map((s) => point([s.lon, s.lat], { name: s.name, kind: 'sea' })))));

// --- curated neighbor cities (ground the map; filtered by frame at runtime) ---
const neighborPlaces = [
  { name: 'Oslo', lon: 10.7522, lat: 59.9139 },
  { name: 'Helsingfors', lon: 24.9384, lat: 60.1699 },
  { name: 'København', lon: 12.5683, lat: 55.6761 },
  { name: 'Trondheim', lon: 10.3951, lat: 63.4305 },
  { name: 'Tallinn', lon: 24.7536, lat: 59.437 },
  { name: 'Vaasa', lon: 21.6158, lat: 63.096 },
  { name: 'Bodø', lon: 14.4049, lat: 67.28 },
];
writeFileSync(join(WORK, 'neighborplaces4326.geojson'),
  JSON.stringify(fc(neighborPlaces.map((p) => point([p.lon, p.lat], { name: p.name })))));

// --- project all three to EPSG:3006 ---
for (const name of ['graticule', 'sealabels', 'neighborplaces']) {
  execFileSync('ogr2ogr', ['-f', 'GeoJSON', join(WORK, `${name}.geojson`),
    join(WORK, `${name}4326.geojson`), '-t_srs', 'EPSG:3006'], { stdio: 'inherit' });
}
console.log('[pipeline] curated layers written.');
