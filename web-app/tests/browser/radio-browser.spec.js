import { test, expect } from '@playwright/test';

const station = { id: 'radio-browser:11111111-2222-3333-4444-555555555555', title: 'Test Music Radio', artist: 'Rock', countrycode: 'US', url: 'https://stream.example.test/live.wav', artwork: '', kind: 'radio', isLive: true };

function wav() {
  const rate = 8000, seconds = 8, data = Buffer.alloc(rate * seconds * 2 + 44);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}

test('browse Radio Browser, play a station, and save it', async ({ page }) => {
  const searches = []; let clicks = 0;
  await page.route('**/api/radio-browser?*', route => { searches.push(new URL(route.request().url()).searchParams); return route.fulfill({ contentType: 'application/json', body: JSON.stringify([station]) }); });
  await page.route('**/api/radio-click?*', route => { clicks++; return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await page.route(station.url, route => route.fulfill({ contentType: 'audio/wav', body: wav() }));
  await page.goto('/');
  await page.locator('.sidebar [data-view=radio]').click();
  await expect(page.locator('.radio-tile')).toHaveCount(1);
  await page.locator('[data-radio-genre=Rock]').click();
  await expect.poll(() => searches.at(-1)?.get('genre')).toBe('Rock');
  await page.locator('#radio-search').fill('Test Music');
  await expect.poll(() => searches.at(-1)?.get('q')).toBe('Test Music');
  await page.locator('.radio-tile-play').click();
  await expect(page.locator('#now-title')).toHaveText('Test Music Radio');
  await expect.poll(() => page.locator('#audio').evaluate(audio => !audio.paused && audio.currentTime > 0)).toBe(true);
  await expect.poll(() => clicks).toBe(1);
  await page.locator('.radio-tile-like').click();
  await page.screenshot({ path: '/tmp/grove-radio-desktop.png' });
  await page.reload();
  await page.locator('.sidebar [data-view=liked]').click();
  await expect(page.locator('.track-name')).toContainText('Test Music Radio');
});

test('radio browser layout fits a phone', async ({ page }) => {
  await page.route('**/api/radio-browser?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([station]) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#content [data-view="radio"]').first().click();
  await expect(page.locator('.radio-tile')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/grove-radio-phone.png' });
});

test('built-in radio stays available if the directory is down', async ({ page }) => {
  await page.route('**/api/radio-browser?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Radio directory unavailable"}' }));
  await page.goto('/');
  await page.locator('.sidebar [data-view=radio]').click();
  await expect(page.getByText(/Radio directory unavailable/)).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(16);
});

test('live Radio Browser returns checked music streams', async ({ request }) => {
  test.setTimeout(60000);
  const response = await request.get('/api/radio-browser?genre=rock', { timeout: 30000 });
  expect(response.ok()).toBe(true);
  const stations = await response.json();
  expect(stations.length).toBeGreaterThan(0);
  expect(stations.every(s => s.kind === 'radio' && /^https?:\/\//.test(s.url) && s.id.startsWith('radio-browser:'))).toBe(true);
});

test('a live Radio Browser station plays in Grove', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.locator('.sidebar [data-view=radio]').click();
  await page.locator('#radio-search').fill('FM4');
  await expect(page.locator('.radio-tile-play').filter({ hasText: 'FM4 | ORF | HQ' })).toBeVisible({ timeout: 30000 });
  await page.locator('.radio-tile-play').filter({ hasText: 'FM4 | ORF | HQ' }).click();
  await expect.poll(() => page.locator('#audio').evaluate(audio => !audio.paused && audio.currentTime > 0), { timeout: 60000 }).toBe(true);
});
