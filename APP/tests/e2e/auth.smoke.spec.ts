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
  await expect(page.getByRole('heading', { name: '适合的场景' })).toBeVisible();
  await expect(page).toHaveTitle('SekerChat｜开源自托管团队协作与即时通讯');
  expect(authorizationHeaders).toEqual([]);
});

test('serves a localized English homepage at a stable URL', async ({ page }) => {
  await page.route('**/api/users/me', (route) => route.fulfill({ status: 401, body: '' }));
  await page.route('**/api/auth/browser/refresh', (route) =>
    route.fulfill({ status: 401, body: '' }),
  );

  await page.goto('/en');

  await expect(
    page.getByRole('heading', {
      name: 'Self-hosted collaboration for small teams',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '切换到中文首页' })).toHaveAttribute('href', '/');
  await expect(page).toHaveTitle('SekerChat | Open-source, self-hosted team chat');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
