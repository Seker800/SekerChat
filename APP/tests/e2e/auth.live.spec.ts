import { expect, test } from '@playwright/test';

const liveBaseUrl = process.env.PLAYWRIGHT_LIVE_BASE_URL?.trim();
const liveEmail = process.env.PLAYWRIGHT_LIVE_LOGIN_EMAIL?.trim();
const livePassword = process.env.PLAYWRIGHT_LIVE_LOGIN_PASSWORD?.trim();

test.describe('live auth smoke', () => {
  test.skip(
    !liveBaseUrl || !liveEmail || !livePassword,
    'PLAYWRIGHT_LIVE_* env vars are required.',
  );

  test('home page can complete a real password login', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('auth-panel')).toBeVisible();
    await page.getByPlaceholder('邮箱').fill(liveEmail!);
    await page.getByTestId('auth-panel').locator('input[type="password"]').fill(livePassword!);
    await page.getByRole('button', { name: '登录' }).click();

    await expect(async () => {
      const url = page.url();
      expect(url).not.toContain('/api/auth/browser/oidc/login');
      expect(
        url === `${liveBaseUrl}/` || /\/(groups|dm)(\/|$)/.test(new URL(url).pathname),
      ).toBeTruthy();
      await expect(page.getByTestId('auth-panel')).toHaveCount(0);
    }).toPass({
      timeout: 15_000,
    });

    await expect(page.getByText(/登录失败|Request failed|INTERNAL_ERROR|DATABASE_/)).toHaveCount(0);
  });
});
