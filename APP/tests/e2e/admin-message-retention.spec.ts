import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('admin message storage allows saving retention and upload limit together', async ({ page }) => {
  let savedPayload: unknown = null;

  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: {
      role: 'SUPER_ADMIN',
    },
  });
  await page.route('**/api/system-config', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quietStart: '08:30',
          quietEnd: '18:00',
          workStatusDefs: '[]',
          chatAttachmentMaxMB: '10240',
          textRetentionDays: '7',
          imageRetentionDays: '30',
          imageRetentionSizeGB: '8',
          fileRetentionDays: '90',
          fileRetentionSizeGB: '20',
        }),
      });
      return;
    }

    if (method === 'PATCH') {
      savedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quietStart: '08:30',
          quietEnd: '18:00',
          workStatusDefs: '[]',
          chatAttachmentMaxMB: '10240',
          textRetentionDays: '0',
          imageRetentionDays: '0',
          imageRetentionSizeGB: '0',
          fileRetentionDays: '0',
          fileRetentionSizeGB: '0',
        }),
      });
      return;
    }

    await route.fallback();
  });
  await page.route('**/api/system-config/storage-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        textMessageCount: 12,
        imageStorageBytes: '1073741824',
        imageCount: 2,
        fileStorageBytes: '2147483648',
        fileCount: 3,
        artifactStorageBytes: '536870912',
        artifactCount: 4,
        totalAttachmentCount: 5,
        totalAttachmentStorageBytes: '3221225472',
        totalStorageBytes: '3758096384',
      }),
    });
  });

  await page.goto('/admin');

  await page.getByRole('button', { name: '消息与附件', exact: true }).click();
  await expect(page.getByRole('heading', { name: '消息与附件' })).toBeVisible();

  const section = page.locator('section', { hasText: '消息与附件' });
  await expect(section.getByText('产出文件')).toBeVisible();
  await expect(section.getByText('4 个 / 0.50 GB')).toBeVisible();
  await expect(section.getByText('合计 3.50 GB')).toBeVisible();
  const uploadLimitInput = section.locator('#chat-attachment-max-gb');
  const textDaysInput = section.locator('#text-retention-days');
  const imageDaysInput = section.locator('#image-retention-days');
  const imageSizeInput = section.locator('#image-retention-size-gb');
  const fileDaysInput = section.locator('#file-retention-days');
  const fileSizeInput = section.locator('#file-retention-size-gb');

  await uploadLimitInput.fill('10');
  await textDaysInput.fill('0');
  await imageDaysInput.fill('0');
  await imageSizeInput.fill('0');
  await fileDaysInput.fill('0');
  await fileSizeInput.fill('0');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await expect(page.getByText('已保存')).toBeVisible();
  expect(savedPayload).toEqual({
    chatAttachmentMaxMB: 10240,
    subscriptionAttachmentMaxMB: 5120,
    textRetentionDays: 0,
    imageRetentionDays: 0,
    imageRetentionSizeGB: 0,
    fileRetentionDays: 0,
    fileRetentionSizeGB: 0,
    retentionSchedule: 'daily',
  });
});

test('admin message storage shows explicit error when config load fails', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: {
      role: 'SUPER_ADMIN',
    },
  });
  await page.route('**/api/system-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'retention config unavailable' }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: '消息与附件', exact: true }).click();

  await expect(page.getByText('retention config unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible();

  const section = page.locator('section', { hasText: '消息与附件' });
  await expect(section.locator('#chat-attachment-max-gb')).toBeDisabled();
  await expect(section.locator('#text-retention-days')).toBeDisabled();
  await expect(section.locator('#image-retention-days')).toBeDisabled();
  await expect(section.locator('#image-retention-size-gb')).toBeDisabled();
  await expect(section.locator('#file-retention-days')).toBeDisabled();
  await expect(section.locator('#file-retention-size-gb')).toBeDisabled();
});
