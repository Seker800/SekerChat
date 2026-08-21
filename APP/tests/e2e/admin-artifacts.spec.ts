import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('admin artifacts page keeps file-station list layout with separate status dimensions', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: {
      role: 'SUPER_ADMIN',
    },
  });

  await page.route('**/api/admin/artifacts*', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname !== '/api/admin/artifacts') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'artifact-1',
          groupId: 'group-1',
          uploaderId: 'user-admin',
          originalName: 'delivery.png',
          storedName: 'delivery.png',
          relativePath: 'artifacts/group-1/delivery.png',
          mimeType: 'image/png',
          size: 204800,
          createdAt: '2026-05-14T08:20:00.000Z',
          contentUrl: '/api/admin/artifacts/artifact-1/content',
          metadataUrl: '/api/admin/artifacts/artifact-1',
          fileExists: true,
          groupName: '值班提醒群',
          groupCategory: '运维',
          groupArchivedAt: null,
          groupWorkStatus: '打包',
          groupArtifactsConfirmed: true,
          uploaderEmail: 'admin@local.invalid',
          uploaderDisplayName: '管理员',
        },
        {
          id: 'artifact-2',
          groupId: 'group-1',
          uploaderId: 'user-admin',
          originalName: 'release.zip',
          storedName: 'release.zip',
          relativePath: 'artifacts/group-1/release.zip',
          mimeType: 'application/zip',
          size: 1073741824,
          createdAt: '2026-05-14T09:20:00.000Z',
          contentUrl: '/api/admin/artifacts/artifact-2/content',
          metadataUrl: '/api/admin/artifacts/artifact-2',
          fileExists: true,
          groupName: '值班提醒群',
          groupCategory: '运维',
          groupArchivedAt: null,
          groupWorkStatus: '打包',
          groupArtifactsConfirmed: true,
          uploaderEmail: 'admin@local.invalid',
          uploaderDisplayName: '管理员',
        },
      ]),
    });
  });

  await page.route('**/api/admin/artifacts/artifact-1/content', async (route) => {
    const body = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pI1QAAAAASUVORK5CYII=',
      'base64',
    );
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body,
    });
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: '产出文件', exact: true }).click();

  const section = page.locator('section', { hasText: '产出文件' });
  await expect(section.getByRole('heading', { name: '产出文件' })).toBeVisible();
  await expect(section.getByPlaceholder('搜频道名、文件名或上传人')).toBeVisible();
  await expect(section.locator('th', { hasText: '名称' })).toBeVisible();
  await expect(section.locator('th', { hasText: '上传人' })).toBeVisible();
  await expect(section.locator('th', { hasText: '大小' })).toBeVisible();
  await expect(section.locator('th', { hasText: '修改日期' })).toBeVisible();
  await expect(section.getByRole('button', { name: '下载 delivery.png' })).toBeVisible();
  await expect(section.getByRole('button', { name: '删除 delivery.png' })).toBeVisible();
  await expect(section.getByRole('button', { name: /值班提醒群/ }).first()).toBeVisible();
  await expect(section.getByText('总大小 1.0 GB')).toBeVisible();
  await expect(section.getByText('200.0 KB')).toHaveCount(1);

  const row = section.locator('tbody tr', { hasText: 'delivery.png' });
  await expect(row.locator('td').nth(1)).toHaveText('管理员');
  await expect(row.locator('td').nth(2)).toHaveText('200.0 KB');
  await expect(row.locator('td').nth(3)).toContainText('2026/5/14');
  await expect(section.getByRole('button', { name: /^名称/ })).toBeVisible();
  await section.getByRole('button', { name: /^名称/ }).click();
  await expect(row.locator('td').first()).toHaveText('delivery.png');
});
