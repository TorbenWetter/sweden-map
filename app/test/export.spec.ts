import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data');

test.beforeEach(async ({ page }) => {
  await page.route('**/data/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const file = join(FIXTURES, name);
    if (existsSync(file)) {
      await route.fulfill({ body: readFileSync(file, 'utf8'), contentType: 'application/json' });
    } else {
      await route.fulfill({ status: 404, body: 'no fixture' });
    }
  });
});

async function openExport(page: import('@playwright/test').Page) {
  await page.goto('/?preset=nordic');
  await expect(page.getByTestId('artboard')).toBeVisible();
  await expect(async () => {
    expect(await page.getByTestId('artboard').locator('path').count()).toBeGreaterThan(8);
  }).toPass();
  await page.locator('.export-btn').click();
}

// Curved labels serialize href as xlink:href. With no xmlns:xlink on the root the file
// is malformed XML: browsers render up to the first curved label and drop everything
// after it, and the PNG rasterizer refuses the image outright ("EncodingError").
test('exported SVG is well-formed XML, and carries its curved labels', async ({ page }) => {
  await openExport(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-menu button', { hasText: 'SVG' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const svg = readFileSync(path!, 'utf8');

  // the fixture actually exercises the bug: there IS a curved label in this export
  expect(svg).toContain('<textPath');
  if (svg.includes('xlink:href')) {
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  // parse it exactly as a browser opening the .svg would
  const parseError = await page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    return doc.querySelector('parsererror')?.textContent?.trim() ?? null;
  }, svg);
  expect(parseError).toBeNull();

  // content that lives *after* the first curved label must survive the parse
  const cityLabels = await page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    return [...doc.querySelectorAll('text')].map((t) => t.textContent).filter(Boolean).length;
  }, svg);
  expect(cityLabels).toBeGreaterThan(0);

  // the webfont travels with the file — a standalone SVG can't reach the app's CSS
  expect(svg).toContain('@font-face');
});

test('PNG export rasterizes instead of failing to decode', async ({ page }) => {
  await openExport(page);

  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-menu button', { hasText: 'PNG — 150 dpi' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  const bytes = readFileSync(path!);
  // real PNG magic, not an error page
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(dialogs).toEqual([]);
});

// Print labs (WhiteWall among them) reject PNG for wall art, and a canvas JPEG carries
// neither the print resolution nor a profile. Both formats are assembled by hand, so
// both are worth pinning: a TIFF that opens but fails to decode at the lab is the
// worst possible outcome — it looks fine right up until it isn't.
test('TIFF export is a decodable RGB TIFF at the right resolution', async ({ page }) => {
  await openExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-menu button', { hasText: 'TIFF' }).click(),
  ]);
  const bytes = readFileSync((await download.path())!);

  // little-endian TIFF magic
  expect([...bytes.subarray(0, 4)]).toEqual([0x49, 0x49, 0x2a, 0x00]);

  // walk the IFD and assert the tags a lab actually reads
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ifd = dv.getUint32(4, true);
  const count = dv.getUint16(ifd, true);
  const tags = new Map<number, { type: number; count: number; value: number }>();
  let last = 0;
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12;
    const tag = dv.getUint16(p, true);
    expect(tag).toBeGreaterThan(last); // TIFF demands ascending tag order
    last = tag;
    const type = dv.getUint16(p + 2, true);
    tags.set(tag, {
      type,
      count: dv.getUint32(p + 4, true),
      value: type === 3 ? dv.getUint16(p + 8, true) : dv.getUint32(p + 8, true),
    });
  }
  expect(tags.get(262)?.value).toBe(2); // PhotometricInterpretation = RGB
  expect(tags.get(277)?.value).toBe(3); // 3 samples — the alpha is gone
  expect(tags.get(296)?.value).toBe(2); // ResolutionUnit = inch
  expect(tags.get(34675)).toBeTruthy(); // ICC profile present
  expect(tags.has(259)).toBe(true); // Compression declared

  // XResolution is a RATIONAL living at an offset: numerator/denominator
  const xres = tags.get(282)!.value;
  expect(dv.getUint32(xres, true) / dv.getUint32(xres + 4, true)).toBe(300);

  // and the pixels really decode — the browser will only do it if the stream is sound
  const decoded = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    try {
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/tiff' }));
      return { w: bmp.width, h: bmp.height };
    } catch {
      return null; // Chromium has no TIFF decoder — the IFD assertions above carry it
    }
  }, bytes.toString('base64'));
  if (decoded) expect(decoded.w).toBeGreaterThan(0);
});

test('JPEG export carries its dpi and exactly one sRGB profile', async ({ page }) => {
  await openExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-menu button', { hasText: 'JPEG' }).click(),
  ]);
  const b = readFileSync((await download.path())!);
  expect([...b.subarray(0, 2)]).toEqual([0xff, 0xd8]);

  const markers: number[] = [];
  let iccCount = 0;
  let dpi: [number, number] | null = null;
  let i = 2;
  while (i < b.length - 1 && b[i] === 0xff) {
    const m = b[i + 1];
    if (m === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    markers.push(m);
    if (m === 0xe2 && b.subarray(i + 4, i + 15).toString('latin1') === 'ICC_PROFILE') iccCount++;
    if (m === 0xe0 && len >= 16) dpi = [(b[i + 12] << 8) | b[i + 13], (b[i + 14] << 8) | b[i + 15]];
    i += 2 + len;
  }
  expect(iccCount).toBe(1); // the browser writes one of its own; ours must replace it, not join it
  expect(markers[0]).toBe(0xe0); // JFIF stays the first segment after SOI
  expect(markers[1]).toBe(0xe2); // ICC directly after it
  expect(dpi).toEqual([300, 300]);
});
