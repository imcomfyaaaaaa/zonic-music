import { test, expect, _electron } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
test('packaged Linux application opens the shared web interface', async () => {
  test.setTimeout(45000);
  const home = await mkdtemp(resolve(tmpdir(), 'grove-desktop-test-'));
  const app = await _electron.launch({ executablePath: resolve('release/Grove-linux-x64/grove'), args: ['--no-sandbox'], env: { ...process.env, GROVE_ENGINE_PORT: '4320', GROVE_TEST_HOME: home } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.locator('.brand')).toHaveAttribute('aria-label', 'Zonic home');
    await expect.poll(async () => page.evaluate(async () => { try { return (await fetch('./api/health')).ok; } catch { return false; } })).toBe(true);
  } finally { await app.close(); await rm(home, { recursive: true, force: true }); }
});
