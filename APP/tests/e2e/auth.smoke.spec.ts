import { expect, test } from '@playwright/test';

test('captures the unauthenticated landing page for review evidence', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: '注册', exact: true }).first()).toBeVisible();
  await expect(page.getByText('适用对象', { exact: true })).toHaveCount(0);
  expect(authorizationHeaders).toEqual([]);
  await expect(page).toHaveScreenshot('auth-landing.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixels: 30,
  });
});
