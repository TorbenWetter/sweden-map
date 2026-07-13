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

/** Rasterize at a chosen dpi via an offscreen canvas. */
export async function exportPng(recipe: Recipe, dpi: 150 | 300): Promise<void> {
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
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('PNG encode failed');
    download(blob, `${slug(recipe.name)}-${dpi}dpi.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Open the print route; the browser's print dialog produces a vector PDF at exact size. */
export function openPrint(recipe: Recipe): void {
  localStorage.setItem(PRINT_PAYLOAD_KEY, JSON.stringify(recipe));
  window.open('/?print=1', '_blank');
}

export function exportRecipeFile(recipe: Recipe): void {
  download(new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }), `${slug(recipe.name)}.recipe.json`);
}
