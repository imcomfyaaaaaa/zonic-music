import { test, expect } from '@playwright/test';

test('TSX account page validates, shows errors, and returns authenticated users to music', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let success = false;
  await page.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({
    status: success ? 200 : 400,
    json: success ? { idToken: 'test-token', refreshToken: 'test-refresh', localId: 'listener-id', email: 'listener@example.com', expiresIn: '3600' } : { error: { message: 'EMAIL_EXISTS' } },
  }));
  await page.route('https://firestore.googleapis.com/**', route => route.fulfill({ json: { fields: { tvPairingCode: { stringValue: '54321' } } } }));
  await page.goto('/login.html');
  await expect(page.locator('#account-title')).toHaveText('Welcome back');
  await page.locator('#switch').click();
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'new-password');
  await page.locator('#email').fill('listener@example.com');
  await page.locator('#password').fill('test-password');
  await page.locator('#submit').click();
  await expect(page.locator('#status')).toContainText('already registered');
  success = true;
  await page.locator('#switch').click();
  await page.locator('#submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#account-open')).toHaveText('Account');
  await page.locator('#account-open').click();
  await expect(page.locator('#signed-in-email')).toHaveText('listener@example.com');
  await page.locator('#signout').click();
  await expect(page.locator('#login-form')).toBeVisible();
  expect(errors).toEqual([]);
});

test('direct Settings page, back navigation, and equalizer survive the TSX shell', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/settings.html');
  await expect(page.locator('#content h1')).toHaveText('Settings');
  await page.locator('[data-view=equalizer]').click();
  await expect(page.locator('.eq-heading h1')).toHaveText('Equalizer');
  await page.goBack();
  await expect(page.locator('#content h1')).toHaveText('Settings');
  await expect(page.locator('#root')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('phone startup loads a matching controller and visible logo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 591, height: 1280 });
  await page.goto('/');
  await expect(page.locator('#content')).not.toContainText('Zonic could not start');
  await expect(page.locator('.mobile-brand img')).toBeVisible();
  await expect.poll(() => page.locator('.mobile-brand img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  expect(errors).toEqual([]);
});
