import type { FC, MapData } from './data';
import type { Projected } from './projection';
import type { LabelOverride, Recipe } from '../types';
import { layerOfType } from '../state/store';

export interface PlacedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  sizeMm: number;
  kind: 'city' | 'sea' | 'lake' | 'neighbor' | 'river' | 'shield' | 'region';
  weight: number;
  italic?: boolean;
  trackingMm?: number;
  overridden?: boolean;
  /** when set, the label renders on this path (curved); x−baseX / y−baseY shift it */
  pathD?: string;
  /** anchor point (the city dot) for leader/drag math */
  baseX: number;
  baseY: number;
}

export function citySizeMm(pop: number): number {
  if (pop >= 800000) return 3.6;
  if (pop >= 250000) return 3.1;
  if (pop >= 100000) return 2.7;
  if (pop >= 50000) return 2.35;
  if (pop >= 25000) return 2.05;
  return 1.8;
}

export function cityDotMm(pop: number): number {
  if (pop >= 800000) return 1.2;
  if (pop >= 250000) return 1.05;
  if (pop >= 100000) return 0.9;
  if (pop >= 50000) return 0.75;
  if (pop >= 25000) return 0.62;
  return 0.5;
}

export function placeId(f: { properties: Record<string, any>; geometry: any }): string {
  const [e, n] = f.geometry.coordinates;
  return `city:${f.properties.name}:${Math.round(e / 1000)}`;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PAD = 0.5;

function collides(b: Box, boxes: Box[]): boolean {
  for (const o of boxes) {
    if (b.x0 < o.x1 + PAD && b.x1 > o.x0 - PAD && b.y0 < o.y1 + PAD && b.y1 > o.y0 - PAD) return true;
  }
  return false;
}

let measureCtx: CanvasRenderingContext2D | null = null;
// mirrors Artboard's SERIF_STACK so collision widths match the rendered font
const SERIF_STACK = "'Iowan Old Style', 'Palatino', 'Georgia', serif";
let measureFamily = 'Inter, sans-serif';
function textWidthMm(text: string, sizeMm: number, italic = false, weight = 500, trackingMm = 0): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return text.length * sizeMm * 0.55;
  measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${sizeMm * 8}px ${measureFamily}`;
  return measureCtx.measureText(text).width / 8 + trackingMm * Math.max(0, text.length - 1);
}

function textBox(x: number, y: number, w: number, sizeMm: number, anchor: PlacedLabel['anchor']): Box {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x0, y0: y - sizeMm * 0.72, x1: x0 + w, y1: y + sizeMm * 0.22 };
}

/** Gentle crest arc through (cx,cy), chord rotated by angleDeg, for water-name labels. */
function arcPath(cx: number, cy: number, widthMm: number, angleDeg: number): string {
  const half = (widthMm * 1.25) / 2;
  const sag = widthMm * 0.07;
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  // screen y grows downward → “up” relative to the rotated baseline is -perp
  const px = -uy;
  const py = ux;
  const x0 = cx - ux * half;
  const y0 = cy - uy * half;
  const x1 = cx + ux * half;
  const y1 = cy + uy * half;
  const qx = cx - px * 2 * sag;
  const qy = cy - py * 2 * sag;
  const r = (v: number) => Math.round(v * 100) / 100;
  return `M ${r(x0)} ${r(y0)} Q ${r(qx)} ${r(qy)} ${r(x1)} ${r(y1)}`;
}

/** Longest LineString of a (Multi)LineString geometry, as coordinate array. */
function longestLine(geometry: any): number[][] {
  if (geometry.type === 'LineString') return geometry.coordinates;
  let best: number[][] = [];
  let bestLen = -1;
  for (const part of geometry.coordinates as number[][][]) {
    let len = 0;
    for (let i = 1; i < part.length; i++) {
      len += Math.hypot(part[i][0] - part[i - 1][0], part[i][1] - part[i - 1][1]);
    }
    if (len > bestLen) {
      bestLen = len;
      best = part;
    }
  }
  return best;
}

/** Largest polygon part of a (Multi)Polygon feature, as a standalone Polygon feature. */
function largestPolygonPart(f: any): any {
  if (f.geometry.type === 'Polygon') return f;
  let best: number[][][] | null = null;
  let bestArea = -1;
  for (const poly of f.geometry.coordinates as number[][][][]) {
    const ring = poly[0];
    let area = 0;
    for (let i = 1; i < ring.length; i++) {
      area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    }
    area = Math.abs(area / 2);
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return { type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates: best } };
}

export interface LabelLayout {
  labels: PlacedLabel[];
  /** ids that could not be placed automatically */
  skipped: string[];
}

export function layoutLabels(
  data: MapData,
  projected: Projected,
  recipe: Recipe,
): LabelLayout {
  const labelsLayer = layerOfType(recipe, 'labels');
  const placesLayer = layerOfType(recipe, 'places');
  const out: PlacedLabel[] = [];
  const skipped: string[] = [];
  if (!labelsLayer?.visible) return { labels: out, skipped };
  measureFamily = labelsLayer.filters.serifLabels ? SERIF_STACK : 'Inter, sans-serif';

  const { wMm, hMm } = recipe.paper;
  const inset = recipe.furniture.frame.show ? recipe.furniture.frame.insetMm : 0;
  const bounds: Box = { x0: inset + 2, y0: inset + 2, x1: wMm - inset - 2, y1: hMm - inset - 2 };
  const boxes: Box[] = [];
  const f = labelsLayer.filters;
  const fontScale = f.fontScale ?? 1;
  const overrides = recipe.labelOverrides;
  // cities always shown regardless of population (county seats etc.) — from the manifest
  const priority = new Set(data.manifest.placePriority ?? []);

  const inFrame = (x: number, y: number) => x > bounds.x0 && x < bounds.x1 && y > bounds.y0 && y < bounds.y1;

  const pushFixed = (
    id: string, text: string, x: number, y: number, sizeMm: number,
    kind: PlacedLabel['kind'], italic = false, trackingMm = 0,
  ) => {
    const ov: LabelOverride | undefined = overrides[id];
    if (ov?.hidden) return;
    const fx = x + (ov?.dxMm ?? 0);
    const fy = y + (ov?.dyMm ?? 0);
    if (!inFrame(fx, fy)) return;
    const w = textWidthMm(text, sizeMm, italic, 500, trackingMm);
    const box = textBox(fx, fy, w, sizeMm, 'middle');
    boxes.push(box);
    out.push({ id, text, x: fx, y: fy, anchor: 'middle', sizeMm, kind, weight: 500, italic, trackingMm, overridden: !!ov, baseX: x, baseY: y });
  };

  // --- fixed water/sea labels first (they own their spot); seas curve along their axis ---
  if (f.seaLabels && data.fc.seaLabels) {
    for (const s of data.fc.seaLabels.features) {
      const name = s.properties.name as string;
      const id = `sea:${name}`;
      const ov: LabelOverride | undefined = overrides[id];
      if (ov?.hidden) continue;
      const [bx, by] = projected.toMm(s.geometry.coordinates[0], s.geometry.coordinates[1]);
      const x = bx + (ov?.dxMm ?? 0);
      const y = by + (ov?.dyMm ?? 0);
      if (!inFrame(x, y)) continue;
      const size = 2.7 * fontScale;
      const w = textWidthMm(name, size, true, 500, 0.5);
      boxes.push(textBox(x, y, w, size, 'middle'));
      out.push({
        id, text: name, x, y, anchor: 'middle', sizeMm: size, kind: 'sea', weight: 500,
        italic: true, trackingMm: 0.5, overridden: !!ov,
        pathD: arcPath(bx, by, w, s.properties.angle ?? 0),
        baseX: bx, baseY: by,
      });
    }
  }
  if (f.lakeLabels && data.fc.lakes) {
    const big = data.fc.lakes.features
      .filter((l) => (l.properties.area_km2 ?? 0) >= 280 && l.properties.name)
      .sort((a, b) => b.properties.area_km2 - a.properties.area_km2)
      .slice(0, 8);
    for (const l of big) {
      const [cx, cy] = projected.path.centroid(l as any);
      const size = (l.properties.area_km2 > 1500 ? 2.4 : 2.0) * fontScale;
      pushFixed(`lake:${l.properties.name}`, l.properties.name, cx, cy, size, 'lake', true, 0.2);
    }
  }
  if (f.neighborLabels && data.fc.neighborPlaces) {
    for (const p of data.fc.neighborPlaces.features) {
      const [x, y] = projected.toMm(p.geometry.coordinates[0], p.geometry.coordinates[1]);
      pushFixed(`nb:${p.properties.name}`, p.properties.name, x, y - 1.6, 2.0 * fontScale, 'neighbor');
    }
  }

  // --- region (admin1) names: muted letterspaced caps at each county's visual center ---
  if (f.regionLabels && data.fc.lan) {
    for (const lan of data.fc.lan.features) {
      const label = (lan.properties.label || lan.properties.name) as string | null;
      if (!label) continue;
      const id = `region:${label}`;
      const ov: LabelOverride | undefined = overrides[id];
      if (ov?.hidden) continue;
      const part = largestPolygonPart(lan);
      const [bx, by] = projected.path.centroid(part);
      const x = bx + (ov?.dxMm ?? 0);
      const y = by + (ov?.dyMm ?? 0);
      if (!inFrame(x, y)) continue;
      // shrink once, then skip, when the name outgrows its county
      const [[px0], [px1]] = projected.path.bounds(part);
      const partW = px1 - px0;
      const text = label.toUpperCase();
      let size = 2.3 * fontScale;
      let trackingMm = size * 0.32;
      let w = textWidthMm(text, size, false, 600, trackingMm);
      if (w > partW * 0.85 && !ov) {
        size = 1.85 * fontScale;
        trackingMm = size * 0.32;
        w = textWidthMm(text, size, false, 600, trackingMm);
        if (w > partW * 0.95) continue;
      }
      boxes.push(textBox(x, y, w, size, 'middle'));
      out.push({
        id, text, x, y, anchor: 'middle', sizeMm: size, kind: 'region', weight: 600,
        trackingMm, overridden: !!ov, baseX: bx, baseY: by,
      });
    }
  }

  // --- city dots are obstacles ---
  const cities = (data.fc.places?.features ?? [])
    .filter((c) => (c.properties.population ?? 0) >= (placesLayer?.filters.minPopulation ?? 0) || priority.has(c.properties.name))
    .map((c) => {
      const [x, y] = projected.toMm(c.geometry.coordinates[0], c.geometry.coordinates[1]);
      return { f: c, x, y, pop: c.properties.population ?? 0 };
    })
    .filter((c) => inFrame(c.x, c.y));

  if (placesLayer?.visible) {
    for (const c of cities) {
      const r = cityDotMm(c.pop);
      boxes.push({ x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r });
    }
  }

  // --- river names flow along their own geometry (placed before cities so cities dodge them) ---
  // Selection uses the longest CONNECTED stem, not the dissolved per-name total: common
  // names (Svartån, Lillån…) merge many distinct small rivers into fake giants otherwise.
  const riversLayer = layerOfType(recipe, 'rivers');
  if ((f.riverLabels ?? true) && riversLayer?.visible && data.fc.rivers) {
    const stemKm = (coords: number[][]) => {
      let m = 0;
      for (let i = 1; i < coords.length; i++) {
        m += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
      }
      return m / 1000; // geometry is in projected meters
    };
    const named = data.fc.rivers.features
      .filter((r) => r.properties.name)
      .map((r) => {
        const stem = longestLine(r.geometry);
        return { r, stem, km: stemKm(stem) };
      })
      .filter((x) => x.km >= 110)
      .sort((a, b) => b.km - a.km)
      .slice(0, 10);

    for (const { r: riv, stem } of named) {
      const name = riv.properties.name as string;
      const id = `river:${name}`;
      const ov: LabelOverride | undefined = overrides[id];
      if (ov?.hidden) continue;
      const size = 1.85 * fontScale;
      const w = textWidthMm(name, size, true, 500, 0.15);

      let pts = stem.map(([e, n]) => projected.toMm(e, n));
      if (pts.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      if (total < w * 1.5) continue; // too short on paper for its name
      const pointAt = (t: number): [number, number] => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < t) i++;
        const f0 = (t - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
        return [
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f0,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f0,
        ];
      };
      const [mx, my] = pointAt(total * 0.5);
      // culling and collision use the final (override-shifted) position
      const x = mx + (ov?.dxMm ?? 0);
      const y = my + (ov?.dyMm ?? 0);
      if (!inFrame(x, y)) continue;
      // keep the name upright: reverse the path when it reads right-to-left at the middle
      if (pointAt(total * 0.58)[0] < pointAt(total * 0.42)[0]) pts = [...pts].reverse();
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const d = 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L');

      boxes.push({ x0: x - w / 2, y0: y - size, x1: x + w / 2, y1: y + size * 0.4 });
      out.push({
        id, text: name, x, y, anchor: 'middle',
        sizeMm: size, kind: 'river', weight: 500, italic: true, trackingMm: 0.15,
        overridden: !!ov, pathD: d, baseX: mx, baseY: my,
      });
    }
  }

  // --- E-road shields: repeated badges along each route; labels dodge them ---
  const roadsLayer = layerOfType(recipe, 'roads');
  const sh = roadsLayer?.shields;
  if (roadsLayer?.visible && sh?.on && data.fc.eroads) {
    for (const road of data.fc.eroads.features) {
      const eref = road.properties.eref as string;
      const size = 1.9 * fontScale;
      const w = textWidthMm(eref, size, false, 700) + 1.7;
      const h = size * 1.63;
      const parts = road.geometry.type === 'LineString' ? [road.geometry.coordinates] : road.geometry.coordinates;
      let n = 0;
      for (const part of parts as number[][][]) {
        const pts = part.map(([e, nn]) => projected.toMm(e, nn));
        let acc = (sh.everyMm ?? 150) / 2;
        for (let i = 1; i < pts.length; i++) {
          const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          while (acc <= seg) {
            const t = acc / seg;
            const bx = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
            const by = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
            acc += sh.everyMm ?? 150;
            const id = `shield:${eref}:${n++}`;
            const ov: LabelOverride | undefined = overrides[id];
            if (ov?.hidden) continue;
            const x = bx + (ov?.dxMm ?? 0);
            const y = by + (ov?.dyMm ?? 0);
            if (!inFrame(x, y)) continue;
            const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
            if (!ov && collides(box, boxes)) continue;
            boxes.push(box);
            out.push({
              id, text: eref, x, y, anchor: 'middle', sizeMm: size, kind: 'shield',
              weight: 700, overridden: !!ov, baseX: bx, baseY: by,
            });
          }
          acc -= seg;
        }
      }
    }
  }

  // --- cities: greedy by priority ---
  const minPop = f.labelMinPopulation ?? 0;
  const candidatesFor = (x: number, y: number, r: number, size: number, w: number) => {
    const dE = r + 0.9;
    const dDiag = (r + 0.9) * 0.8;
    return [
      { x: x + dE, y: y + size * 0.28, anchor: 'start' as const },
      { x: x - dE, y: y + size * 0.28, anchor: 'end' as const },
      { x, y: y - r - 0.8, anchor: 'middle' as const },
      { x, y: y + r + size * 0.85, anchor: 'middle' as const },
      { x: x + dDiag, y: y - dDiag + size * 0.28, anchor: 'start' as const },
      { x: x - dDiag, y: y - dDiag + size * 0.28, anchor: 'end' as const },
      { x: x + dDiag, y: y + dDiag + size * 0.28, anchor: 'start' as const },
      { x: x - dDiag, y: y + dDiag + size * 0.28, anchor: 'end' as const },
    ];
  };

  const ranked = cities
    .filter((c) => c.pop >= minPop || priority.has(c.f.properties.name))
    .sort((a, b) => (b.pop + (priority.has(b.f.properties.name) ? 1e6 : 0)) - (a.pop + (priority.has(a.f.properties.name) ? 1e6 : 0)));

  for (const c of ranked) {
    const name = c.f.properties.name as string;
    const id = placeId(c.f);
    const ov = overrides[id];
    if (ov?.hidden) continue;
    const size = citySizeMm(c.pop) * fontScale;
    const weight = priority.has(name) || c.pop >= 100000 ? 600 : 500;
    const w = textWidthMm(name, size, false, weight);
    const r = cityDotMm(c.pop);

    if (ov) {
      const x = c.x + ov.dxMm;
      const y = c.y + ov.dyMm;
      const box = textBox(x, y, w, size, 'middle');
      boxes.push(box);
      out.push({ id, text: name, x, y, anchor: 'middle', sizeMm: size, kind: 'city', weight, overridden: true, baseX: c.x, baseY: c.y });
      continue;
    }

    let placed = false;
    for (const cand of candidatesFor(c.x, c.y, r, size, w)) {
      const box = textBox(cand.x, cand.y, w, size, cand.anchor);
      if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) continue;
      if (collides(box, boxes)) continue;
      boxes.push(box);
      out.push({ id, text: name, x: cand.x, y: cand.y, anchor: cand.anchor, sizeMm: size, kind: 'city', weight, baseX: c.x, baseY: c.y });
      placed = true;
      break;
    }
    if (!placed) skipped.push(id);
  }

  return { labels: out, skipped };
}
