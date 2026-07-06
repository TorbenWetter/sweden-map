import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The smoke test never touches real pipeline output: every /data/* request is
// answered from the tiny synthetic fixtures (see make-fixtures.mjs).
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

test('studio renders, labels, and restyles the map', async ({ page }) => {
  await page.goto('/?preset=nordic');

  const artboard = page.getByTestId('artboard');
  await expect(artboard).toBeVisible();

  // vector content arrived and rendered
  await expect(async () => {
    expect(await artboard.locator('path').count()).toBeGreaterThan(8);
  }).toPass();

  // the label engine placed a fixture city
  await expect(artboard.getByText('Stockholm')).toBeVisible();

  // sea carries the Nordic preset color…
  await expect(page.getByTestId('sea')).toHaveAttribute('fill', '#DDE8EE');

  // …and switching presets restyles it
  await page.locator('.preset-button').click();
  await page.getByRole('button', { name: /Polarnatt/ }).click();
  await expect(page.getByTestId('sea')).toHaveAttribute('fill', '#070B14');

  // instrument strip is alive
  await expect(page.getByText('SWEREF 99 TM · EPSG:3006')).toBeVisible();
});

test('layers duplicate as independent instances', async ({ page }) => {
  await page.goto('/?preset=nordic');
  await expect(page.getByTestId('artboard')).toBeVisible();

  // select the Lakes layer and duplicate it
  await page.locator('.layer-row').filter({ has: page.getByText('Lakes', { exact: true }) }).click();
  await page.locator('.inspector-actions .link-btn', { hasText: 'Duplicate' }).click();
  await expect(page.locator('.layer-row').filter({ has: page.getByText('Lakes copy', { exact: true }) })).toBeVisible();

  // the duplicate is selected and independently deletable
  await page.locator('.inspector-actions .link-btn', { hasText: 'Delete' }).click();
  await expect(page.getByText('Lakes copy', { exact: true })).toHaveCount(0);
  await expect(page.locator('.layer-row').filter({ has: page.getByText('Lakes', { exact: true }) })).toBeVisible();
});
