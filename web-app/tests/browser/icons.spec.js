import { test, expect } from '@playwright/test';
test('player icons expose clear states and SVG clicks retain their actions', async ({ page }) => {
 await page.goto('/');
 await expect(page.locator('#play')).toHaveAccessibleName('Play');
 await expect(page.locator('#play > svg')).toHaveAttribute('data-icon', 'play');
 await page.locator('#shuffle > svg').click();
 await expect(page.locator('#shuffle')).toHaveAttribute('aria-pressed', 'true');
 await expect(page.locator('#shuffle > svg')).toHaveAttribute('data-icon', 'shuffle');
 await page.locator('#shuffle').click();
 await expect(page.locator('#shuffle > svg')).toHaveAttribute('data-icon', 'sparkles');
 await expect(page.locator('#shuffle')).toHaveAccessibleName('Smart Shuffle on; turn shuffle off');
 await page.locator('#shuffle').click(); await expect(page.locator('#shuffle')).toHaveAttribute('aria-pressed', 'false');
 await page.locator('.sidebar [data-view="settings"] > svg').click();
 await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});
test('phone controls have consistent touch targets and visible SVG navigation', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
 await expect(page.locator('#content h1')).toBeVisible();
 for (const selector of ['#queue-toggle', '.mobile-tabs [data-view="home"]']) {
  const box = await page.locator(selector).boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
 }
 await expect(page.locator('.mobile-tabs [data-view="home"] svg')).toBeVisible();
 await page.screenshot({ path: '/tmp/grove-icons-mobile.png' });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('desktop icon and button polish renders consistently', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
 await expect(page.locator('.sidebar nav button:visible > svg')).toHaveCount(7);
 await page.screenshot({ path: '/tmp/grove-icons-desktop.png' });
 await page.locator('header [data-view=settings]').click();
 await expect(page.locator('[data-feature="archive-export"] svg')).toBeVisible();
});
