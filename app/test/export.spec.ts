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
