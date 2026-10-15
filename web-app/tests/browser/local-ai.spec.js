import { test, expect } from '@playwright/test';
test('bundled on-device AI ranks candidates with all external requests blocked', async ({ page }) => {
 test.setTimeout(180000);
 const external = [];
 await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); } return route.continue(); });
 await page.route('**/ai-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Bundled AI test</title>' }));
 await page.goto('/ai-test.html');
 const result = await page.evaluate(async () => {
  const { rankOnDevice } = await import('/src/local-ai.js');
  const seed = { title: 'Soft relaxing piano for sleep', artist: 'Quiet Piano' };
  return rankOnDevice([seed], [{ id: 'quiet', title: 'Peaceful gentle piano meditation', artist: 'Quiet Piano' }, { id: 'loud', title: 'Aggressive heavy metal guitar screams', artist: 'Metal Fury' }]);
 });
 expect(result).toEqual(['quiet', 'loud']);
 expect(external).toEqual([]);
});
