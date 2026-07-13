// Drop line features whose course is already covered by a longer, near-parallel
// neighbour — OSM maps each track of a double-track railway (and each carriageway
// of a dual carriageway) as its own way. At poster scale those coincide, and two
// coincident *dashed* strokes interleave their gaps and read as a solid line.
//
// --group matters: a trunk road running beside a motorway, or a branch line beside a
// main line, is NOT a duplicate — it is a road the map may have to draw on its own.
// Comparing only within a class keeps those, and still collapses the twinned ways.
//
// Usage: node dedupe-lines.mjs <in.geojson> <out.geojson> [tolM] [coverFrac] [groupField]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inFile, outFile, tolArg, coverArg, groupField] = process.argv;
const TOL = Number(tolArg ?? 45); // meters: how close counts as "the same course"
const COVER = Number(coverArg ?? 0.8); // drop a way once this much of it is covered
const COS_TOL = Math.cos((25 * Math.PI) / 180); // near-parallel only

const parts = (g) =>
  g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];

const lengthOf = (g) => {
  let m = 0;
  for (const p of parts(g)) {
    for (let i = 1; i < p.length; i++) m += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  }
  return m;
};

/** distance from point p to segment ab */
function distToSeg(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

// one spatial hash per group, cell = TOL
const grids = new Map();
const gridFor = (key) => {
  let g = grids.get(key);
  if (!g) grids.set(key, (g = new Map()));
  return g;
};
const groupOf = (f) => (groupField ? String(f.properties?.[groupField] ?? '') : '');

function addSegment(grid, a, b) {
  const seg = [a, b];
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / TOL));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const k = `${Math.floor(x / TOL)},${Math.floor(y / TOL)}`;
    let bucket = grid.get(k);
    if (!bucket) grid.set(k, (bucket = []));
    if (!bucket.includes(seg)) bucket.push(seg);
  }
}

/** is segment a→b already covered by a kept, near-parallel segment of the same group? */
function covered(grid, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl = Math.hypot(dx, dy) || 1;
  const cx = Math.floor(mx / TOL);
  const cy = Math.floor(my / TOL);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (const [sa, sb] of grid.get(`${cx + ox},${cy + oy}`) ?? []) {
        const ex = sb[0] - sa[0];
        const ey = sb[1] - sa[1];
        const el = Math.hypot(ex, ey) || 1;
        // near-parallel (undirected) …
        if (Math.abs((dx * ex + dy * ey) / (dl * el)) < COS_TOL) continue;
        // … and running along the same course
        if (distToSeg([mx, my], sa, sb) <= TOL && distToSeg(a, sa, sb) <= TOL * 1.5 && distToSeg(b, sa, sb) <= TOL * 1.5) {
          return true;
        }
      }
    }
  }
  return false;
}

const fc = JSON.parse(readFileSync(inFile, 'utf8'));
// longest first: the survivor of a duplicated pair should be the fuller course
const ordered = fc.features
  .map((f, i) => ({ f, i, len: lengthOf(f.geometry) }))
  .sort((a, b) => b.len - a.len);

const kept = [];
let dropped = 0;
for (const { f } of ordered) {
  const grid = gridFor(groupOf(f));
  let covLen = 0;
  let totLen = 0;
  const segs = [];
  for (const p of parts(f.geometry)) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l === 0) continue;
      totLen += l;
      segs.push([a, b]);
      if (covered(grid, a, b)) covLen += l;
    }
  }
  if (totLen > 0 && covLen / totLen >= COVER) {
    dropped++;
    continue;
  }
  for (const [a, b] of segs) addSegment(grid, a, b);
  kept.push(f);
}

writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features: kept }));
console.error(
  `[dedupe-lines] ${fc.features.length} → ${kept.length} features ` +
    `(dropped ${dropped} duplicate-course ways, tol=${TOL}m` +
    `${groupField ? `, within each ${groupField}` : ''})`,
);
