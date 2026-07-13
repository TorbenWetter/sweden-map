// Generate the tiny synthetic dataset the smoke test serves instead of real pipeline
// output — geometry is nonsense-but-valid EPSG:3006-ish shapes, a few KB total.
// Regenerate with: node test/make-fixtures.mjs
import { topology } from 'topojson-server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data');
mkdirSync(OUT, { recursive: true });

const fc = (features) => ({ type: 'FeatureCollection', features });
const feat = (geometry, properties = {}) => ({ type: 'Feature', properties, geometry });
const rect = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const line = (coords) => ({ type: 'LineString', coordinates: coords });
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] });

const write = (name, collection) => {
  const topo = topology({ [name.replace(/\W/g, '_')]: collection }, 1e4);
  writeFileSync(join(OUT, name), JSON.stringify(topo));
};

// mainland + one island
const sweden = fc([
  feat(rect(300000, 6200000, 900000, 7500000)),
  feat(rect(930000, 6400000, 980000, 6470000)),
]);
const neighbors = fc([feat(rect(200000, 6600000, 290000, 7600000))]);
const lan = fc([
  feat(rect(300000, 6200000, 900000, 6850000), { name: 'Sydlän', ref: 'S' }),
  feat(rect(300000, 6850000, 900000, 7500000), { name: 'Nordlän', ref: 'N' }),
]);
const kommun = fc([
  feat(rect(300000, 6200000, 600000, 6850000), { name: 'SV' }),
  feat(rect(600000, 6200000, 900000, 6850000), { name: 'SO' }),
  feat(rect(300000, 6850000, 600000, 7500000), { name: 'NV' }),
  feat(rect(600000, 6850000, 900000, 7500000), { name: 'NO' }),
]);
const lakes = fc([
  feat(rect(380000, 6480000, 470000, 6560000), { name: 'Vänern', area_km2: 5650 }),
  feat(rect(540000, 6440000, 580000, 6540000), { name: 'Vättern', area_km2: 1890 }),
  feat(rect(700000, 7000000, 715000, 7015000), { name: 'Lillsjön', area_km2: 4 }),
]);
const rivers = fc([
  feat(line([[650000, 7400000], [700000, 7100000], [760000, 6950000]]), { name: 'Testälven', length_km: 420 }),
  feat(line([[500000, 6900000], [520000, 6800000]]), { name: 'Bäcken', length_km: 45 }),
]);
const roads = fc(['motorway', 'trunk', 'primary', 'secondary'].map((cls, i) =>
  feat(line([[350000 + i * 30000, 6250000], [820000 - i * 20000, 7420000 - i * 60000]]), { class: cls }),
));
const railways = fc([
  feat(line([[400000, 6260000], [740000, 7380000]]), { usage: 'main' }),
  feat(line([[560000, 6700000], [700000, 6900000]]), { usage: 'branch' }),
]);
const parks = fc([
  feat(rect(420000, 7200000, 520000, 7300000), { name: 'Testparken', kind: 'national_park', area_km2: 1000 }),
]);
const places = fc([
  feat(point(760000, 6580000), { name: 'Stockholm', place: 'city', population: 984748, capital: 'yes' }),
  feat(point(370000, 6400000), { name: 'Göteborg', place: 'city', population: 587549 }),
  feat(point(430000, 6210000), { name: 'Malmö', place: 'city', population: 325069 }),
  feat(point(690000, 7480000), { name: 'Kiruna', place: 'town', population: 17002 }),
]);
const ferries = fc([
  feat(line([[905000, 6560000], [980000, 6620000], [1040000, 6700000]]), { name: 'Testlinjen', length_km: 160 }),
  feat(line([[890000, 6420000], [905000, 6435000]]), { name: 'Lillfärjan', length_km: 4 }),
]);
const trails = fc([
  feat(line([[420000, 7050000], [460000, 7250000], [500000, 7420000]]), { name: 'Testleden', network: 'nwn', length_km: 420 }),
]);
const lighthouses = fc([feat(point(950000, 6440000), { name: 'Testfyren' })]);
const airports = fc([feat(point(720000, 6560000), { name: 'Test Airport', iata: 'TST' })]);
const castles = fc([
  feat(point(500000, 6500000), { name: 'Testslottet', kind: 'castle' }),
  feat(point(520000, 6480000), { name: 'Testherrgården', kind: 'manor' }),
]);
const eroads = fc([
  feat(line([[380000, 6250000], [500000, 6900000], [560000, 7450000]]), { eref: 'E4' }),
]);
const bathymetry = fc([20, 50, 100, 200, 500].map((depth, i) =>
  feat(rect(940000 + i * 2000, 6300000, 1060000 - i * 2000, 7400000 - i * 30000), { depth }),
));
const contours = fc([200, 400, 600, 1000].map((elev) =>
  feat(line([[320000 + elev * 20, 6900000], [380000 + elev * 20, 7300000]]), { elev }),
));
const waterlines = fc([1, 2, 3, 4].map((ring) =>
  feat(
    {
      type: 'LineString',
      coordinates: [
        [300000 - ring * 8000, 6200000 - ring * 8000],
        [900000 + ring * 8000, 6200000 - ring * 8000],
        [900000 + ring * 8000, 7500000 + ring * 8000],
      ],
    },
    { ring },
  ),
));
const graticule = fc([
  feat(line([[250000, 6500000], [1050000, 6500000]]), { axis: 'parallel', deg: 58 }),
  feat(line([[600000, 6050000], [600000, 7650000]]), { axis: 'meridian', deg: 16 }),
]);
const neBorders = fc([feat(line([[245000, 6600000], [245000, 7600000]]))]);
const seaLabels = fc([
  feat(point(1000000, 6700000), { name: 'Östersjön', kind: 'sea' }),
  feat(point(250000, 6300000), { name: 'Kattegatt', kind: 'sea' }),
]);
const neighborPlaces = fc([feat(point(230000, 6950000), { name: 'Oslo' })]);

const tiered = {
  sweden, neighbors, lan, kommun, lakes, rivers, roads, railways, parks, contours,
};
for (const [id, collection] of Object.entries(tiered)) {
  write(`${id}.print.json`, collection);
  write(`${id}.preview.json`, collection);
}
write('places.json', places);
write('waterlines.json', waterlines);
write('bathymetry.json', bathymetry);
write('ferries.json', ferries);
write('trails.json', trails);
write('eroads.json', eroads);
write('lighthouses.json', lighthouses);
write('airports.json', airports);
write('castles.json', castles);
write('graticule.json', graticule);
write('ne-borders.json', neBorders);
write('sea-labels.json', seaLabels);
write('neighbor-places.json', neighborPlaces);

const info = (file) => ({ file, bytes: 1, features: 1, bbox: null });
const SINGLE_FILES = {
  places: 'places.json',
  waterlines: 'waterlines.json',
  bathymetry: 'bathymetry.json',
  ferries: 'ferries.json',
  trails: 'trails.json',
  eroads: 'eroads.json',
  lighthouses: 'lighthouses.json',
  airports: 'airports.json',
  castles: 'castles.json',
  graticule: 'graticule.json',
  neBorders: 'ne-borders.json',
  seaLabels: 'sea-labels.json',
  neighborPlaces: 'neighbor-places.json',
};
const manifest = {
  manifestVersion: 2,
  generatedAt: '2026-01-01T00:00:00.000Z',
  country: { name: 'Sverige', code: 'SE' },
  epsg: 3006,
  crsLabel: 'SWEREF 99 TM',
  locale: 'sv-SE',
  frame: { xmin: 200000, ymin: 6000000, xmax: 1100000, ymax: 7700000 },
  swedenBounds: [300000, 6200000, 980000, 7500000],
  placePriority: ['Stockholm', 'Göteborg', 'Malmö'],
  layerLabels: { sweden: 'Sweden', lan: 'Län borders', kommun: 'Kommun borders' },
  legendLabels: { roads: 'Större väg', railways: 'Järnväg', ferries: 'Färjelinje', trails: 'Vandringsled', lighthouses: 'Fyr', airports: 'Flygplats', castles: 'Slott', lakes: 'Sjö', parks: 'Nationalpark', lan: 'Länsgräns', kommun: 'Kommungräns', places: 'Tätort' },
  layers: {
    ...Object.fromEntries(
      Object.keys(tiered).map((id) => [
        id,
        {
          tiered: true,
          ...(id === 'lan' || id === 'kommun' ? { mesh: true } : {}),
          preview: info(`${id}.preview.json`),
          print: info(`${id}.print.json`),
        },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(SINGLE_FILES).map(([id, file]) => [
        id,
        { tiered: false, preview: info(file), print: info(file) },
      ]),
    ),
  },
  hillshade: null,
  attribution: ['Fixture data — not a real map'],
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`fixtures written to ${OUT}`);
