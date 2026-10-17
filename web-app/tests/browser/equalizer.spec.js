import { test, expect } from '@playwright/test';

test('presets enable the EQ, apply actual filter gains, and persist', async ({ page }) => {
  await page.addInitScript(() => {
    window.testFilters = [];
    const original = AudioContext.prototype.createBiquadFilter;
    AudioContext.prototype.createBiquadFilter = function (...args) {
      const filter = original.apply(this, args); window.testFilters.push(filter); return filter;
    };
  });
  await page.goto('/');
  const open = async () => {
    await page.locator('header [data-view=settings]').click();
    await page.locator('[data-view=equalizer]').click();
  };
  await open();
  await expect(page.locator('#eq-enabled')).not.toBeChecked();
  await page.locator('#eq-preset').selectOption('bassBoost');
  await expect(page.locator('#eq-enabled')).toBeChecked();
  await expect(page.locator('#eq-preset')).toHaveValue('bassBoost');
  await expect.poll(() => page.evaluate(() => window.testFilters.map(f => f.gain.value))).toEqual([8, 8, 3, -2, -2]);
  await page.reload(); await open();
  await expect(page.locator('#eq-preset')).toHaveValue('bassBoost');
  await expect(page.locator('#eq-enabled')).toBeChecked();
  await page.locator('#eq-preset').selectOption('trebleBoost');
  await expect.poll(() => page.evaluate(() => window.testFilters.map(f => f.gain.value))).toEqual([-2, -2, 2, 8, 8]);
  await page.locator('[data-band="0"]').fill('1');
  await expect(page.locator('#eq-preset')).toHaveValue('');
  await page.locator('[data-feature=eq-reset]').click();
  await expect(page.locator('#eq-preset')).toHaveValue('balanced');
  await expect.poll(() => page.evaluate(() => window.testFilters.map(f => f.gain.value))).toEqual([0, 0, 0, 0, 0]);
});
