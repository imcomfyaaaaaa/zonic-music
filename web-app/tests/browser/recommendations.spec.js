import { test, expect } from '@playwright/test';
test('Smart Shuffle blends queue-only recommendations and removes them when disabled', async ({ page }) => {
 await page.addInitScript(() => { HTMLMediaElement.prototype.play = async function () {}; });
 await page.route('**/api/related?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'yt:abcdefghijk', ytid: 'abcdefghijk', title: 'New Discovery', artist: 'New Artist', kind: 'youtube', duration: 180 }]) }));
 await page.goto('/');
 await page.evaluate(async () => {
  const { emptyLibrary, openLibraryDatabase, dbWrite } = await import('/src/library.js');
  const state = emptyLibrary(); state.settings.shuffle = true; state.settings.smartShuffle = true; state.settings.localAI = false;
  state.tracks = Array.from({ length: 7 }, (_, i) => ({ id: 'yt:original00' + i, ytid: 'original00' + i, title: 'Original ' + i, artist: 'Artist ' + i, kind: 'youtube', duration: 180 }));
  state.playlists = [{ id: 'mix', name: 'My Mix', tracks: state.tracks.map(t => t.id) }];
  await dbWrite(await openLibraryDatabase(), 'state', 'library', state);
 });
 await page.reload(); await page.locator('#playlist-nav button').click(); await page.locator('[data-playlist-play]').click();
 await page.locator('.player [data-view="queue"]').click();
 await expect(page.locator('.track').filter({ hasText: '✦ Recommended' })).toHaveCount(1);
 await expect(page.locator('.track')).toHaveCount(8);
 await page.locator('#shuffle').click(); await expect(page.locator('.track')).toHaveCount(7);
 await page.locator('#playlist-nav button').click(); await expect(page.locator('.track')).toHaveCount(7);
});
