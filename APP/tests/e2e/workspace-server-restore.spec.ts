import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

for (const width of [1440, 760]) {
  test(`restored Server keeps completed channels in the collapsed archive at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 });
    await installAuthenticatedAppWithOptions(page, {
      currentUserOverride: { role: 'SUPER_ADMIN' },
    });
    await page.goto('/groups/group-1');
    const original = await page.evaluate(async () => (await fetch('/api/groups')).json());
    let archived = true;
    const timestamp = '2026-04-01T00:00:00Z';
    await page.route('**/api/groups', async (route) => {
      const server = {
        id: 'restore-server',
        name: '恢复测试',
        archivedAt: archived ? timestamp : null,
      };
      await route.fulfill({
        json: [
          original[0],
          ...[false, true].map((completed) => ({
            ...original[0],
            id: completed ? 'completed-channel' : 'restored-channel',
            name: completed ? '已完成项目' : '进行中项目',
            serverId: server.id,
            server,
            category: server.name,
            categoryArchivedAt: server.archivedAt,
            archivedAt: archived || completed ? timestamp : null,
            workState: { status: completed ? '完成' : 'ing' },
          })),
        ],
      });
    });
    await page.route('**/api/servers/restore-server/archive', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ archive: false });
      archived = false;
      await route.fulfill({
        json: {
          serverId: 'restore-server',
          name: '恢复测试',
          category: '恢复测试',
          archivedAt: null,
          groupCount: 2,
        },
      });
    });
    await page.reload();
    if (width < 800) await page.getByTestId('sidebar-toggle-button').click();
    await page.getByRole('button', { name: '展开 Server 操作' }).click();
    await page.getByTitle('恢复测试 · 已归档').click();
    await page.getByTitle('恢复测试 · 已归档').click({ button: 'right' });
    await page.getByText('打开 server 设置', { exact: true }).click();
    await page.getByRole('button', { name: '取消归档 Server', exact: true }).click();
    await page.getByRole('button', { name: '取消归档', exact: true }).click();
    await expect.poll(() => archived).toBe(false);
    await page
      .getByRole('dialog', { name: '恢复测试', exact: true })
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    const serverButton = page
      .getByTestId('server-rail-category')
      .and(page.getByTitle(/^恢复测试 ·/));
    await serverButton.click();
    await expect(page.locator('[data-group-id="restored-channel"]')).toBeVisible();
    await expect(page.locator('[data-group-id="completed-channel"]')).toHaveCount(0);
    await expect(page.getByText('已归档 (1)', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/server-restored-collapsed-${width}.png` });
    await page.getByText('已归档 (1)', { exact: true }).click();
    await expect(page.locator('[data-group-id="completed-channel"]')).toBeVisible();
    await page.screenshot({ path: `test-results/server-restored-expanded-${width}.png` });
  });
}
