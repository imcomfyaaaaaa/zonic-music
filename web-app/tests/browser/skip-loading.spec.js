import { test, expect } from '@playwright/test';

for (const stalled of [true, false]) test(`phone next and previous work with ${stalled ? 'stalled' : 'playing'} audio`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/health', route => route.fulfill({ json: { fileStorage: false } }));
  if (stalled) await page.addInitScript(() => {
    // Model a stream whose play promise never resolves (buffering).
    HTMLMediaElement.prototype.play = function () { return new Promise(() => {}); };
  });
  await page.goto('/');
  await expect(page.locator('#content')).not.toBeEmpty();
  if (!stalled) {
    await page.locator('header [data-view="settings"]').click();
    await page.locator('#audio-normalization').check();
    await page.reload();
    await page.locator('header [data-view="settings"]').click();
    await expect(page.locator('#audio-normalization')).toBeChecked();
  }
  const data = Buffer.alloc(960044);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  await page.locator('#music-files').setInputFiles(['Alpha', 'Beta', 'Gamma'].map(name => ({ name: `${name}.wav`, mimeType: 'audio/wav', buffer: data })));
  await page.locator('[data-play]').filter({ hasText: 'Alpha' }).click();
  await expect(page.locator('#now-title')).toHaveText('Alpha');
  if (!stalled) await expect.poll(() => page.locator('#local-audio').evaluate(audio => !audio.paused && audio.readyState >= 3)).toBe(true);
  await page.locator('#now-title').click();
  await page.locator('#next svg').click();
  await expect(page.locator('#now-title')).toHaveText('Beta');
  await page.locator('#next svg').click();
  await expect(page.locator('#now-title')).toHaveText('Gamma');
  if (!stalled) await expect.poll(() => page.locator('#local-audio').evaluate(audio => !audio.paused && audio.readyState >= 3)).toBe(true);
  await page.locator('#previous svg').click();
  await expect(page.locator('#now-title')).toHaveText('Beta');
  await page.locator('#previous svg').click();
  await expect(page.locator('#now-title')).toHaveText('Alpha');
  if (!stalled) await expect.poll(() => page.locator('#local-audio').evaluate(audio => !audio.paused && audio.readyState >= 3)).toBe(true);
});
