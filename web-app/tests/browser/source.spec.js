import { test, expect } from '@playwright/test';
test('online source errors appear without breaking the local library', async ({ page }) => {
  await page.route('**/api/search?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Source temporarily unavailable' }) }));
  await page.goto('/'); await page.locator('#search').fill('Music');
  await expect(page.locator('#toast')).toHaveText('Source temporarily unavailable');
  await expect(page.locator('#search')).toBeEnabled();
});
test('source favorites survive a library reload', async ({ page }) => {
  const song = { id: 'yt:abcdefghijk', ytid: 'abcdefghijk', title: 'Source Song', artist: 'Source Artist', kind: 'youtube' };
  await page.route('**/api/search?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([song]) }));
  await page.goto('/'); await page.locator('#search').fill('Source Song');
  await expect(page.locator('.track strong')).toHaveText('Source Song'); await page.locator('[data-like]').click(); await expect(page.locator('[data-like]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await page.locator('nav [data-view=liked]').click(); await expect(page.locator('.track strong')).toHaveText('Source Song');
});
test('typing searches YouTube automatically and opens the selected song', async ({ page }) => {
  const song = { id: 'yt:abcdefghijk', ytid: 'abcdefghijk', title: 'YouTube Song', artist: 'Source Artist', kind: 'youtube' };
  let searches = 0;
  await page.route('**/api/search?*', route => { searches++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify([song]) }); });
  await page.route('**/api/stream?*', route => route.fulfill({ status: 206, contentType: 'audio/wav', body: Buffer.alloc(4096) }));
  await page.goto('/');
  await page.locator('#search').fill('YouTube Song');
  await expect(page.getByRole('heading', { name: 'YouTube music' })).toBeVisible();
  await expect(page.locator('.track strong')).toHaveText('YouTube Song');
  expect(searches).toBe(1);
  await page.locator('.track .cover').click();
  await expect(page.locator('#now-title')).toHaveText('YouTube Song');
});
test('live upstream search and stream range request', async ({ request }) => {
  test.setTimeout(120000);
  const health = await request.get('/api/health'); expect(health.ok()).toBe(true);
  const results = await request.get('/api/search?q=lofi%20instrumental'); expect(results.ok()).toBe(true);
  const songs = await results.json(); expect(songs.length).toBeGreaterThan(0);
  expect(songs.every(s => !/\b\d+\s+hours?\b/i.test(s.title))).toBe(true);
  const song = songs.find(s => s.ytid);
  const stream = await request.get('/api/stream?id=' + song.ytid, { headers: { Range: 'bytes=0-4095' }, timeout: 90000 });
  expect(stream.status()).toBe(206); expect((await stream.body()).length).toBe(4096);
  expect(stream.headers()['content-type']).toMatch(/audio|video/);
});
test('live YouTube result starts playing in the web player', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.locator('#search').fill('lofi instrumental');
  await expect(page.locator('.track-name').first()).toBeVisible({ timeout: 45000 });
  await page.locator('.track .cover').first().click();
  await expect.poll(() => page.locator('#local-audio').evaluate(audio => !audio.paused && audio.currentTime > 0), { timeout: 90000 }).toBe(true);
});
test('a phone-sized music result plays when its artwork is tapped', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#search').fill('lofi instrumental');
  await expect(page.locator('.track .cover').first()).toBeVisible({ timeout: 45000 });
  await page.locator('.track .cover').first().click();
  await expect.poll(() => page.locator('#local-audio').evaluate(audio => !audio.paused && audio.currentTime > 0), { timeout: 90000 }).toBe(true);
  await expect(page.locator('#now-title')).not.toHaveText('Your next favorite awaits');
});
