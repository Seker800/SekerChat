import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

test.describe('workspace composer', () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedApp(page);
    await page.goto('/groups/group-1');
    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByTestId('workspace-surface')).toBeVisible();
  });

  test('keeps the composer compact and exposes reply state', async ({ page }) => {
    const composer = page.getByTestId('message-composer');
    await expect(composer).toHaveAttribute('rows', '1');
    await expect(page.getByTestId('composer-attachment-input')).toHaveAttribute('multiple', '');

    const replyButton = page.getByRole('button', { name: '回复', exact: true }).first();
    await replyButton.click();

    const replyBanner = page.getByTestId('reply-banner');
    await expect(replyBanner).toContainText('正在回复 值班同学');
    await expect(replyBanner.getByRole('button', { name: '关闭', exact: true })).toBeVisible();

    await replyButton.click();
    await expect(replyBanner).toBeHidden();
  });
});
