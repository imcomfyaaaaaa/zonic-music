import { test, expect } from '@playwright/test';

test('account sign-up creates a persisted TV pairing code and sign-out works', async ({ page }) => {
  await page.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ idToken: 'test-token', refreshToken: 'test-refresh', localId: 'listener-id', email: 'listener@example.com', expiresIn: '3600' }) }));
  await page.route('https://firestore.googleapis.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ fields: { tvPairingCode: { stringValue: '54321' } } }) }));
  await page.goto('/login.html');
  await page.getByRole('button', { name: 'New to Zonic? Create an account' }).click();
  await page.getByLabel('Email').fill('listener@example.com');
  await page.getByLabel('Password').fill('secret123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#account-open')).toHaveText('Account');
  await page.locator('#account-open').click();
  await expect(page.locator('#signed-in-email')).toHaveText('listener@example.com');
  await expect(page.locator('.pairing-code strong')).toHaveText(/^\d{5}$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
