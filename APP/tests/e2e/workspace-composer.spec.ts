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

test('shows byte progress and server finalization separately for chat photos', async ({
  page,
}, testInfo) => {
  await installAuthenticatedApp(page);
  let releaseCompletion: () => void = () => undefined;
  const completionGate = new Promise<void>((resolve) => {
    releaseCompletion = resolve;
  });
  await page.route('**/api/uploads/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/initiate')) {
      await route.fulfill({
        json: {
          id: 'photo-upload',
          partSizeBytes: 32 * 1024 * 1024,
          createdAt: new Date().toISOString(),
        },
      });
    } else if (path.includes('/parts/')) {
      await route.fulfill({
        json: { uploadSessionId: 'photo-upload', partNumber: 1, etag: 'photo-etag' },
      });
    } else if (path.endsWith('/complete')) {
      await completionGate;
      await route.fulfill({
        json: { kind: 'CHAT_ATTACHMENT', file: { id: 'photo-file', kindLabel: 'image' } },
      });
    } else await route.fallback();
  });
  await page.goto('/groups/group-1');
  await expect(page.getByTestId('workspace-surface')).toBeVisible();
  await page
    .getByTestId('composer-attachment-input')
    .setInputFiles({
      name: 'slow-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(128 * 1024, 1),
    });
  try {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByText(/正在完成上传/)).toBeVisible();
    await expect(page.getByText(/已确认 1\/1/)).toBeVisible();
    await expect(page.getByText(/已用时/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('photo-upload-finalizing.png') });
  } finally {
    releaseCompletion();
  }
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('shows photo upload errors immediately with a retry action', async ({ page }, testInfo) => {
  await installAuthenticatedApp(page);
  let partAttempts = 0;
  await page.route('**/api/uploads/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          id: 'denied-upload',
          partSizeBytes: 32 * 1024 * 1024,
          createdAt: new Date().toISOString(),
        },
      });
    } else {
      partAttempts += 1;
      await route.fulfill({ status: 403, json: { message: '没有上传权限' } });
    }
  });
  await page.goto('/groups/group-1');
  await page
    .getByTestId('composer-attachment-input')
    .setInputFiles({
      name: 'denied-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('image'),
    });
  await expect(page.getByText('没有上传权限', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重发', exact: true })).toBeVisible();
  expect(partAttempts).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('photo-upload-error.png') });
});
