import { expect, test } from '@playwright/test';

test('validates the unauthenticated homepage and login entry', async ({ page }) => {
  const authorizationHeaders: string[] = [];
  await page.route('**/api/users/me', async (route) => {
    const authorization = route.request().headers().authorization;
    if (authorization) authorizationHeaders.push(authorization);
    await route.fulfill({ status: 401, body: '' });
  });
  await page.route('**/api/auth/browser/refresh', async (route) => {
    const authorization = route.request().headers().authorization;
    if (authorization) authorizationHeaders.push(authorization);
    await route.fulfill({ status: 401, body: '' });
  });
  await page.goto('/');

  await expect(page.getByTestId('auth-panel')).toBeVisible();
  await expect(page.getByTestId('auth-gate-panel')).toBeVisible();
  await expect(page.getByTestId('oidc-login-button')).toHaveCount(0);
  await expect(page.getByPlaceholder('邮箱')).toBeVisible();
  await expect(page.getByPlaceholder('密码')).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: '登录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '没有账号？注册' })).toBeVisible();
  await expect(page).toHaveTitle('SekerChat｜登录');
  expect(authorizationHeaders).toEqual([]);
});

test('serves a localized English login at a stable URL', async ({ page }) => {
  await page.route('**/api/users/me', (route) => route.fulfill({ status: 401, body: '' }));
  await page.route('**/api/auth/browser/refresh', (route) =>
    route.fulfill({ status: 401, body: '' }),
  );

  await page.goto('/en');

  await expect(page.getByTestId('auth-gate-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to SekerChat' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Need an account? Register' })).toBeVisible();
  await expect(page).toHaveTitle('SekerChat | Sign in');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
