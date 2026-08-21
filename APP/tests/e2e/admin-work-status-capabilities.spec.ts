import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('admin can choose packaging or archive capability for each work status', async ({ page }) => {
  let savedPayload: unknown = null;
  const definitions = [
    {
      name: '准备交付',
      tone: '#ffd93d',
      textTone: '#1e1f22',
      isPackaging: true,
    },
    {
      name: '已结束',
      tone: '#6c757d',
      textTone: '#ffffff',
      isArchive: true,
    },
  ];

  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: { role: 'SUPER_ADMIN' },
  });
  await page.route('**/api/system-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workStatusDefs: JSON.stringify(definitions) }),
      });
      return;
    }

    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workStatusDefs: JSON.stringify(definitions) }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: '工作状态', exact: true }).click();

  const section = page.locator('section', { hasText: '工作状态' });
  const packagingRow = section.getByTestId('work-status-row').filter({ hasText: '准备交付' });
  await expect(packagingRow.getByRole('checkbox', { name: '打包能力' })).toBeChecked();
  await expect(packagingRow.getByRole('checkbox', { name: '归档能力' })).not.toBeChecked();

  await expect(section).toHaveScreenshot('admin-work-status-capabilities.png', {
    animations: 'disabled',
    caret: 'hide',
  });

  await packagingRow.getByRole('checkbox', { name: '归档能力' }).click();
  await expect(packagingRow.getByRole('checkbox', { name: '打包能力' })).not.toBeChecked();
  await expect(packagingRow.getByRole('checkbox', { name: '归档能力' })).toBeChecked();

  await section.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => savedPayload).not.toBeNull();
  expect(savedPayload).toMatchObject({
    workStatusDefs: [
      expect.objectContaining({
        name: '准备交付',
        isPackaging: false,
        isArchive: true,
      }),
      expect.objectContaining({
        name: '已结束',
        isPackaging: false,
        isArchive: true,
      }),
    ],
  });
});
