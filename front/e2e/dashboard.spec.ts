import { test, expect } from '@playwright/test';

// We anchor on stable data-testid values rather than text/headings (copyright and labels change).
test('dashboard loads: header, pair selector, chart, footer', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-header')).toBeVisible();
  await expect(page.getByTestId('pair-selector')).toBeVisible();
  await expect(page.getByTestId('dashboard-root')).toBeVisible();
  // The chart renders after the candles have loaded.
  await expect(page.getByTestId('chart-container')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('app-footer')).toBeVisible();
});
