import type { Recipe } from '../types';
import { harmonize, hexToHsl, hslToHex } from './harmony';

export interface Swatch {
  hex: string;
  /** pixel share 0..1 */
  weight: number;
}

/**
 * Extract ~6 dominant colors from an image: coarse RGB histogram (4 bits/channel),
 * top bins merged by proximity — deterministic, dependency-free, fast.
 */
export function extractPalette(img: HTMLImageElement): Swatch[] {
  const SIZE = 96;
  const canvas = document.createElement('canvas');
  const ratio = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight, 1);
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 4-bit histogram with per-bin running average of true colors
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n += 1;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
    total += 1;
  }
  if (!total) return [];

  const candidates = [...bins.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40);

  // merge close candidates, biggest first
  const merged: Array<{ n: number; r: number; g: number; b: number }> = [];
  for (const c of candidates) {
    const near = merged.find((m) => (m.r - c.r) ** 2 + (m.g - c.g) ** 2 + (m.b - c.b) ** 2 < 52 * 52);
    if (near) {
      const n = near.n + c.n;
      near.r = (near.r * near.n + c.r * c.n) / n;
      near.g = (near.g * near.n + c.g * c.n) / n;
      near.b = (near.b * near.n + c.b * c.n) / n;
      near.n = n;
    } else {
      merged.push({ ...c });
    }
  }

  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return merged
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((c) => ({ hex: `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`, weight: c.n / total }));
}

export interface PaletteAssignment {
  land: string;
  accent?: string;
  ink?: string;
  waterHue?: number;
}

/** Choose roles from extracted swatches: land anchor, road accent, ink, water hue. */
export function assignRoles(swatches: Swatch[]): PaletteAssignment | null {
  if (!swatches.length) return null;
  const withHsl = swatches
    .map((sw) => ({ ...sw, hsl: hexToHsl(sw.hex) }))
    .filter((sw): sw is Swatch & { hsl: [number, number, number] } => sw.hsl !== null);
  if (!withHsl.length) return null;

  // land: the most prevalent swatch, preferring mid-to-light and low-to-mid saturation
  const land = [...withHsl].sort(
    (a, b) => b.weight * (1 - Math.abs(b.hsl[2] - 0.72)) - a.weight * (1 - Math.abs(a.hsl[2] - 0.72)),
  )[0];

  // accent: most saturated swatch clearly distinct from land
  const accent = [...withHsl]
    .filter((sw) => sw !== land && sw.hsl[1] > 0.25)
    .sort((a, b) => b.hsl[1] * b.weight - a.hsl[1] * a.weight)[0];

  // ink: darkest swatch
  const ink = [...withHsl].filter((sw) => sw.hsl[2] < 0.45).sort((a, b) => a.hsl[2] - b.hsl[2])[0];

  // water hue: a blue-ish swatch steers the derived water family
  const water = withHsl.find((sw) => sw.hsl[0] >= 165 && sw.hsl[0] <= 265 && sw.hsl[1] >= 0.12);

  // tame the land swatch for map duty: quiet saturation, keep its light/dark family
  const [lh, ls, ll] = land.hsl;
  const landHex = hslToHex(
    lh,
    Math.min(ls, 0.3),
    ll < 0.45 ? Math.max(ll, 0.08) : Math.min(Math.max(ll, 0.66), 0.95),
  );

  return {
    land: landHex,
    accent: accent?.hex,
    ink: ink?.hex,
    waterHue: water?.hsl[0],
  };
}

/** Apply an image palette to a draft recipe: harmonize tints + inject accent/ink. */
export function applyImagePalette(recipe: Recipe, swatches: Swatch[]): void {
  const roles = assignRoles(swatches);
  if (!roles) return;
  harmonize(recipe, roles.land, { waterHue: roles.waterHue });
  for (const l of recipe.layers) {
    if (roles.accent && l.id === 'roads') l.stroke = roles.accent;
    if (roles.ink && (l.id === 'places' || l.id === 'railways')) {
      if (l.id === 'places') l.fill = roles.ink;
      else l.stroke = roles.ink;
    }
    if (roles.ink && l.id === 'labels') l.fill = roles.ink;
  }
  if (roles.ink) recipe.furniture.ink = roles.ink;
  recipe.furniture.halo = roles.land;
}
