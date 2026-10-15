import { test, expect } from '@playwright/test';
function wav() {
  const rate = 8000, seconds = 60, data = Buffer.alloc(rate * seconds * 2 + 44);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8); data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  for (let i = 44; i < data.length; i += 2) data.writeInt16LE(Math.sin((i - 44) / 2 * Math.PI * 2 * 440 / rate) * 1500, i);
  return data;
}
test('local music persists, plays, pauses, seeks, and joins playlists', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.locator('#music-files').setInputFiles({ name: 'Test Artist - Test Song.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await page.locator('[data-play]').filter({ hasText: 'Test Song' }).click();
  await expect(page.locator('#now-title')).toHaveText('Test Song');
  await expect.poll(() => page.locator('#local-audio').evaluate(a => !a.paused && a.currentTime > 0)).toBe(true);
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#play').click(); await expect.poll(() => page.locator('#local-audio').evaluate(a => a.paused)).toBe(true);
  await page.locator('#seek').fill('50'); await expect.poll(() => page.locator('#local-audio').evaluate(a => Math.round(a.currentTime))).toBe(30);
  await page.locator('[data-like]').click();
  await page.locator('#new-playlist').click(); await page.locator('#dialog-input').fill('My Mix'); await page.locator('#dialog-confirm').click();
  await page.locator('.sidebar nav [data-view=library]').click(); await page.locator('[data-menu]').click();
  await page.locator('#sheet-playlist').selectOption({ label: 'My Mix' });
  await page.locator('#playlist-nav button').click(); await expect(page.locator('.track strong')).toHaveText('Test Song');
  await page.reload(); await page.locator('.sidebar nav [data-view=liked]').click(); await expect(page.locator('.track strong')).toHaveText('Test Song');
  await page.locator('[data-play]').click(); await expect.poll(() => page.locator('#local-audio').evaluate(a => !a.paused)).toBe(true);
  expect(errors).toEqual([]);
});
test('radio catalog, TV navigation, and desktop layout render', async ({ page }) => {
  await page.goto('/'); await page.locator('.sidebar nav [data-view=radio]').click(); await expect(page.locator('.card')).toHaveCount(16);
  await page.locator('#tv-mode').click(); await expect(page.locator('body')).toHaveClass('tv');
  await page.locator('.card').first().focus(); await page.keyboard.press('ArrowRight'); await expect(page.locator('button:focus')).toBeVisible(); await expect(page.locator('.card').first()).not.toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.locator('#tv-mode').click(); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
test('phone layout has no horizontal overflow and offers import', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Import music', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('backup includes playlist data and rejects unsafe audio URLs', async ({ page }) => {
  await page.goto('/'); await page.locator('.sidebar-bottom [data-view=settings]').click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export library' }).click(); expect((await download).suggestedFilename()).toMatch(/grove-library/);
  const data = { version: 1, tracks: [{ id: 'evil', title: '<script>bad</script>', kind: 'url', url: 'javascript:alert(1)' }], playlists: [] };
  await page.locator('#backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('#toast')).toHaveText('Invalid audio URL in backup.'); await expect(page.locator('#dialog')).not.toBeVisible();
});
