import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

for (const width of [1440, 390]) {
  test(`article viewers retain the first date on repeat opens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await installAuthenticatedApp(page);
    await page.goto('/dm/__dm_subscription__');
    await expect(page.getByText('文章发布与确认已读', { exact: true })).toHaveCount(0);
    const article = page.getByRole('button', { name: '打开文章 文章使用指南' });
    await article.click();
    const viewers = page.getByRole('region', { name: '浏览记录' });
    await expect(viewers.getByRole('heading', { name: '浏览量 2', exact: true })).toBeVisible();
    await expect(viewers.getByText('值班同学', { exact: true })).toBeVisible();
    await expect(viewers.getByText('管理员', { exact: true })).toBeVisible();
    await expect(viewers.locator('time')).toHaveText(['2026/04/09', '2026/04/10']);
    await expect(viewers.locator('li')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '确认已读' })).toHaveCount(0);
    await viewers.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/article-viewers-${width}.png`,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole('button', { name: '返回文章列表' }).click();
    await article.click();
    await expect(viewers.getByRole('heading', { name: '浏览量 2', exact: true })).toBeVisible();
    await expect(viewers.locator('li')).toHaveCount(2);
    await expect(viewers.locator('time')).toHaveText(['2026/04/09', '2026/04/10']);
  });
}
