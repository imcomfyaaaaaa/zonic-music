import { test, expect } from '@playwright/test';

test('Android TV enables focus layout and shows phone pairing automatically', async ({ page }) => {
  await page.route('**/native/**', async route => {
    const command = new URL(route.request().url()).pathname.split('/').pop();
    const data = command === 'state' ? {
      paused: true, position: 0, duration: null, readyState: 2, index: -1,
      track: null, queue: [], platform: { tv: true, remote: { url: 'http://192.168.1.20:4368/', pin: '123456' } },
    } : null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/?native=1&tv=1');
  await expect(page.locator('body')).toHaveClass(/tv/);
  await expect(page.locator('#tv-mode')).toBeHidden();
  await page.locator('[data-view="settings"]').first().click();
  await expect(page.getByText('TV mode is on automatically for this device.')).toBeVisible();
  await expect(page.getByText('http://192.168.1.20:4368/')).toBeVisible();
  await expect(page.getByText('123456')).toBeVisible();
});

test('phone remote pairs and sends playback commands', async ({ page }) => {
  const commands = [];
  await page.route('**/remote.js', route => route.continue({ url: 'http://127.0.0.1:4317/src/remote.js' }));
  await page.route('**/remote.css', route => route.continue({ url: 'http://127.0.0.1:4317/src/remote.css' }));
  await page.route('**/pair', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'test-session' }) }));
  await page.route('**/state', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ paused: true, position: 20, duration: 120, volume: .6, index: 0, track: { title: 'Demo Song', artist: 'Demo Artist' }, queue: [{ title: 'Demo Song', artist: 'Demo Artist' }, { title: 'Next Song', artist: 'Another Artist' }] }) }));
  await page.route('**/command', async route => { commands.push(route.request().postDataJSON()); await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto('/src/tv-remote.html');
  await page.locator('#pin').fill('123456');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Song' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: /Next Song/ }).click();
  await expect.poll(() => commands.map(c => c.command)).toEqual(['play', 'queue-play']);
  expect(commands[1].index).toBe(1);
});

test('Android phone opens the TV address from Grove settings', async ({ page }) => {
  await page.route('**/native/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('http://192.168.1.20:4368/', route => route.fulfill({ contentType: 'text/html', body: '<h1>Zonic TV remote</h1>' }));
  await page.goto('/?native=1&tv=0');
  await page.locator('[data-view="settings"]').first().click();
  await page.getByRole('button', { name: 'Connect to TV' }).click();
  await page.locator('#dialog-input').fill('http://192.168.1.20:4368/');
  await page.locator('#dialog-confirm').click();
  await expect(page.getByRole('heading', { name: 'Zonic TV remote' })).toBeVisible();
});
