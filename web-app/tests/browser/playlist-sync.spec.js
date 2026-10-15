import { test, expect } from '@playwright/test';

test('YouTube playlists add newly uploaded songs on reopening and respect the sync switch', async ({ page }) => {
  let songs = 1;
  await page.route('**/api/playlist?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Fresh uploads', source: 'https://www.youtube.com/playlist?list=PL1234567890', tracks: Array.from({ length: songs }, (_, i) => ({ id: `yt:abcdefghij${i}`, ytid: `abcdefghij${i}`, kind: 'youtube', title: `Song ${i + 1}`, artist: 'Artist' })) }) }));
  await page.goto('/');
  await page.locator('.sidebar-bottom [data-view=settings]').click();
  await expect(page.getByRole('heading', { name: 'Library & YouTube sync' })).toBeVisible();
  await page.getByRole('button', { name: 'Import YouTube playlist' }).click();
  await page.locator('#dialog-input').fill('https://www.youtube.com/playlist?list=PL1234567890');
  await page.locator('#dialog-confirm').click();
  await expect(page.locator('.track')).toHaveCount(1);
  songs = 2;
  await page.reload();
  await expect(page.locator('#playlist-nav button')).toContainText('Fresh uploads');
  await page.locator('#playlist-nav button').click();
  await expect(page.locator('.track')).toHaveCount(2);
  await page.locator('.sidebar-bottom [data-view=settings]').click();
  await page.locator('[data-feature-setting="autoPlaylistSync"]').uncheck();
  songs = 3;
  await page.reload();
  await page.locator('#playlist-nav button').click();
  await expect(page.locator('.track')).toHaveCount(2);
  await page.locator('.sidebar-bottom [data-view=settings]').click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.locator('#playlist-nav button').click();
  await expect(page.locator('.track')).toHaveCount(3);
});

test('redesigned settings stay readable on desktop and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.sidebar-bottom [data-view=settings]').click();
  await expect(page.locator('#settings-library')).toBeVisible();
  await expect(page.locator('#settings-playback')).toBeVisible();
  await page.screenshot({ path: '/tmp/grove-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#settings-library')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/grove-settings-phone.png' });
});
