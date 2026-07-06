import type { LayerId, Recipe } from '../types';

// ---- color math ----

export function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

/** Circular hue mix along the shortest arc. */
function hueMix(from: number, to: number, w: number): number {
  let d = ((to - from + 540) % 360) - 180;
  return (from + d * w + 360) % 360;
}

// ---- role derivation ----

type Family = 'water' | 'land' | 'park';

interface RoleSpec {
  family: Family;
  /** lightness delta relative to the anchor (nordic-calibrated) */
  dl: number;
  /** saturation nudge on top of the family base */
  ds?: number;
}

// Calibrated so a Nordic land anchor (#F7F5F0) reproduces the Nordic palette closely.
const ROLES: Array<{ id: LayerId; prop: 'fill' | 'stroke'; spec: RoleSpec }> = [
  { id: 'sea', prop: 'fill', spec: { family: 'water', dl: -0.055 } },
  { id: 'bathymetry', prop: 'fill', spec: { family: 'water', dl: -0.125, ds: 0.02 } },
  { id: 'waterlines', prop: 'stroke', spec: { family: 'water', dl: -0.165 } },
  { id: 'lakes', prop: 'fill', spec: { family: 'water', dl: -0.125, ds: 0.05 } },
  { id: 'rivers', prop: 'stroke', spec: { family: 'water', dl: -0.125, ds: 0.05 } },
  { id: 'graticule', prop: 'stroke', spec: { family: 'water', dl: -0.225, ds: -0.08 } },
  { id: 'neighbors', prop: 'fill', spec: { family: 'land', dl: -0.045 } },
  { id: 'neBorders', prop: 'stroke', spec: { family: 'land', dl: -0.145 } },
  { id: 'parks', prop: 'fill', spec: { family: 'park', dl: -0.095 } },
  { id: 'sweden', prop: 'stroke', spec: { family: 'water', dl: -0.3, ds: -0.18 } },
  { id: 'lan', prop: 'stroke', spec: { family: 'water', dl: -0.32, ds: -0.25 } },
  { id: 'kommun', prop: 'stroke', spec: { family: 'water', dl: -0.145, ds: -0.2 } },
];

function deriveRole(anchor: [number, number, number], spec: RoleSpec, waterHue = 205): string {
  const [h, s, l] = anchor;
  let hue: number;
  let sat: number;
  switch (spec.family) {
    case 'water':
      hue = hueMix(h, waterHue, 0.95);
      sat = Math.min(0.34, Math.max(s, 0.2) + 0.04);
      break;
    case 'park':
      hue = hueMix(h, 100, 0.85);
      sat = Math.min(0.36, Math.max(s * 0.8, 0.18));
      break;
    default:
      hue = h;
      sat = Math.min(0.38, s * 0.65);
  }
  sat = Math.min(1, Math.max(0.03, sat + (spec.ds ?? 0)));
  const light = Math.min(0.98, Math.max(0.04, l + spec.dl));
  return hslToHex(hue, sat, light);
}

/**
 * Re-derive all tint roles from the anchor (land) color, on a draft recipe.
 * Accents — roads, railways, ferries, trails, shields, icons, labels, furniture —
 * are authored choices and stay untouched.
 */
export function harmonize(recipe: Recipe, anchorHex: string, opts?: { waterHue?: number }): void {
  const anchor = hexToHsl(anchorHex);
  if (!anchor) return;
  for (const layer of recipe.layers) {
    if (layer.id === 'sweden') layer.fill = anchorHex;
    for (const role of ROLES) {
      if (role.id !== layer.id) continue;
      layer[role.prop] = deriveRole(anchor, role.spec, opts?.waterHue);
    }
  }
}
