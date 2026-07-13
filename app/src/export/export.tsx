import { renderToStaticMarkup } from 'react-dom/server';
import { Artboard } from '../map/Artboard';
import { loadMapData, type MapData } from '../map/data';
import { layoutLabels, type LabelLayout } from '../map/labels';
import { makeProjection, type Projected } from '../map/projection';
import type { Recipe, Tier } from '../types';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import srgbIccUrl from './srgb.icc?url';
import { encodeTiff, tagJpeg } from './raster';

export const PRINT_PAYLOAD_KEY = 'sweden-map-studio.print.v1';

const INTER_WEIGHTS: Array<[number, string]> = [
  [400, inter400],
  [500, inter500],
  [600, inter600],
  [700, inter700],
];

export interface Composition {
  data: MapData;
  projected: Projected;
  layout: LabelLayout;
  /** server URL of the blend-appropriate hillshade variant for this recipe, or null */
  hillshadeUrl: string | null;
}

export async function compose(recipe: Recipe, tier: Tier): Promise<Composition> {
  const data = await loadMapData(tier);
  const projected = makeProjection(data.manifest, recipe);
  const layout = layoutLabels(data, projected, recipe);
  const hs = recipe.layers.find((l) => l.id === 'hillshade');
  const variant = (hs?.filters.blend ?? 'multiply') === 'screen' ? 'light' : 'dark';
  const hillshadeUrl =
    hs?.visible && data.manifest.hillshade ? `/data/${data.manifest.hillshade.variants[variant][tier]}` : null;
  return { data, projected, layout, hillshadeUrl };
}

async function toDataURL(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** @font-face rules with the webfont bytes inlined — a standalone SVG can't reach the app's CSS. */
async function fontFaceCss(): Promise<string> {
  const faces = await Promise.all(
    INTER_WEIGHTS.map(async ([weight, url]) => {
      const data = await toDataURL(url);
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};src:url(${data}) format('woff2');}`;
    }),
  );
  return faces.join('');
}

export function svgMarkup(recipe: Recipe, c: Composition, hillshadeHref: string | null, fontCss = ''): string {
  const { wMm, hMm } = recipe.paper;
  const body = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      // textPath/href below serializes to xlink:href — without this declaration the
      // file is not well-formed XML, and every strict parser (browsers viewing the
      // .svg, the PNG rasterizer) stops at the first curved label.
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width={`${wMm}mm`}
      height={`${hMm}mm`}
      viewBox={`0 0 ${wMm} ${hMm}`}
      fontFamily="Inter, 'Helvetica Neue', sans-serif"
    >
      {fontCss ? <style dangerouslySetInnerHTML={{ __html: fontCss }} /> : null}
      <Artboard recipe={recipe} data={c.data} projected={c.projected} layout={c.layout} hillshade={hillshadeHref ? { dark: hillshadeHref, light: hillshadeHref } : null} />
    </svg>,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '') || 'sweden';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True-vector SVG at print detail. Hillshade (if visible) embeds as a data URL. */
export async function exportSvg(recipe: Recipe): Promise<void> {
  const c = await compose(recipe, 'print');
  const [href, fontCss] = await Promise.all([
    c.hillshadeUrl ? toDataURL(c.hillshadeUrl) : Promise.resolve(null),
    fontFaceCss(),
  ]);
  const markup = svgMarkup(recipe, c, href, fontCss);
  download(new Blob([markup], { type: 'image/svg+xml' }), `${slug(recipe.name)}-${recipe.paper.wMm}x${recipe.paper.hMm}mm.svg`);
}

/** Browsers refuse to allocate beyond ~2^28 canvas pixels; fail with advice, not a decode error. */
const MAX_CANVAS_PX = 268_000_000;

export type RasterFormat = 'png' | 'jpeg' | 'tiff';

let iccBytes: Uint8Array | null = null;
async function srgbIcc(): Promise<Uint8Array> {
  if (!iccBytes) iccBytes = new Uint8Array(await (await fetch(srgbIccUrl)).arrayBuffer());
  return iccBytes;
}

/** Paint the poster onto an offscreen canvas at the requested dpi. */
async function rasterize(recipe: Recipe, dpi: number): Promise<{ canvas: HTMLCanvasElement; w: number; h: number }> {
  const w = Math.round((recipe.paper.wMm / 25.4) * dpi);
  const h = Math.round((recipe.paper.hMm / 25.4) * dpi);
  if (w * h > MAX_CANVAS_PX) {
    throw new Error(
      `${w}×${h} px exceeds what a browser canvas can hold. Use 150 dpi, a smaller paper size, or export PDF/SVG (both stay vector).`,
    );
  }
  const c = await compose(recipe, 'print');
  const [href, fontCss] = await Promise.all([
    c.hillshadeUrl ? toDataURL(c.hillshadeUrl) : Promise.resolve(null),
    fontFaceCss(),
  ]);
  const markup = svgMarkup(recipe, c, href, fontCss);
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    // Lay the paper down first. Antialiasing along the sheet edge otherwise leaves
    // semi-transparent pixels, and a print lab compositing that alpha is a coin toss.
    ctx.fillStyle = recipe.furniture.frame.show ? recipe.furniture.frame.paper : '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, w, h };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Rasterize at a chosen dpi. TIFF and JPEG carry the print resolution and an sRGB
 * profile, because that is what a print lab wants and what a canvas will not give you:
 * WhiteWall and the like reject PNG for wall art outright.
 */
export async function exportRaster(recipe: Recipe, dpi: 150 | 300, format: RasterFormat): Promise<void> {
  const { canvas, w, h } = await rasterize(recipe, dpi);
  const name = `${slug(recipe.name)}-${recipe.paper.wMm}x${recipe.paper.hMm}mm-${dpi}dpi`;

  if (format === 'png') {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('PNG encode failed');
    download(blob, `${name}.png`);
    return;
  }

  const icc = await srgbIcc();

  if (format === 'jpeg') {
    // 0.97 keeps the hairlines clean; below ~0.9 browsers also drop to 4:2:0 chroma,
    // which is exactly what smears a red hairline on a pale ground
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.97));
    if (!blob) throw new Error('JPEG encode failed');
    download(await tagJpeg(blob, dpi, icc), `${name}.jpg`);
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  const { data } = ctx.getImageData(0, 0, w, h);
  download(await encodeTiff(data, w, h, dpi, icc), `${name}.tif`);
}

/** @deprecated kept for the existing tests/callers */
export async function exportPng(recipe: Recipe, dpi: 150 | 300): Promise<void> {
  return exportRaster(recipe, dpi, 'png');
}

/** Open the print route; the browser's print dialog produces a vector PDF at exact size. */
export function openPrint(recipe: Recipe): void {
  localStorage.setItem(PRINT_PAYLOAD_KEY, JSON.stringify(recipe));
  window.open('/?print=1', '_blank');
}

export function exportRecipeFile(recipe: Recipe): void {
  download(new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }), `${slug(recipe.name)}.recipe.json`);
}
