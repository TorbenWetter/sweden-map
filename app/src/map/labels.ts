import type { FC, MapData } from './data';
import type { Projected } from './projection';
import type { LabelOverride, Recipe } from '../types';
import { layerOf } from '../state/store';

export interface PlacedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  sizeMm: number;
  kind: 'city' | 'sea' | 'lake' | 'neighbor';
  weight: number;
  italic?: boolean;
  trackingMm?: number;
  overridden?: boolean;
  /** anchor point (the city dot) for leader/drag math */
  baseX: number;
  baseY: number;
}

export const RESIDENS = new Set([
  'Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Nyköping', 'Linköping', 'Jönköping',
  'Växjö', 'Kalmar', 'Visby', 'Karlskrona', 'Halmstad', 'Vänersborg', 'Karlstad',
  'Örebro', 'Västerås', 'Falun', 'Gävle', 'Härnösand', 'Östersund', 'Umeå', 'Luleå',
]);

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
function textWidthMm(text: string, sizeMm: number, italic = false, weight = 500, trackingMm = 0): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return text.length * sizeMm * 0.55;
  measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${sizeMm * 8}px Inter, sans-serif`;
  return measureCtx.measureText(text).width / 8 + trackingMm * Math.max(0, text.length - 1);
}

function textBox(x: number, y: number, w: number, sizeMm: number, anchor: PlacedLabel['anchor']): Box {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x0, y0: y - sizeMm * 0.72, x1: x0 + w, y1: y + sizeMm * 0.22 };
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
  const labelsLayer = layerOf(recipe, 'labels');
  const placesLayer = layerOf(recipe, 'places');
  const out: PlacedLabel[] = [];
  const skipped: string[] = [];
  if (!labelsLayer?.visible) return { labels: out, skipped };

  const { wMm, hMm } = recipe.paper;
  const inset = recipe.furniture.frame.show ? recipe.furniture.frame.insetMm : 0;
  const bounds: Box = { x0: inset + 2, y0: inset + 2, x1: wMm - inset - 2, y1: hMm - inset - 2 };
  const boxes: Box[] = [];
  const f = labelsLayer.filters;
  const fontScale = f.fontScale ?? 1;
  const overrides = recipe.labelOverrides;

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

  // --- fixed water/sea labels first (they own their spot) ---
  if (f.seaLabels && data.fc.seaLabels) {
    for (const s of data.fc.seaLabels.features) {
      const [x, y] = projected.toMm(s.geometry.coordinates[0], s.geometry.coordinates[1]);
      pushFixed(`sea:${s.properties.name}`, s.properties.name, x, y, 2.7 * fontScale, 'sea', true, 0.5);
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

  // --- city dots are obstacles ---
  const cities = (data.fc.places?.features ?? [])
    .filter((c) => (c.properties.population ?? 0) >= (placesLayer?.filters.minPopulation ?? 0) || RESIDENS.has(c.properties.name))
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
    .filter((c) => c.pop >= minPop || RESIDENS.has(c.f.properties.name))
    .sort((a, b) => (b.pop + (RESIDENS.has(b.f.properties.name) ? 1e6 : 0)) - (a.pop + (RESIDENS.has(a.f.properties.name) ? 1e6 : 0)));

  for (const c of ranked) {
    const name = c.f.properties.name as string;
    const id = placeId(c.f);
    const ov = overrides[id];
    if (ov?.hidden) continue;
    const size = citySizeMm(c.pop) * fontScale;
    const weight = RESIDENS.has(name) || c.pop >= 100000 ? 600 : 500;
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
