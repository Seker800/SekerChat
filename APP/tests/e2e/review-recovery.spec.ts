import { expect, test } from '@playwright/test';
import { installAuthenticatedApp, installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('session bootstrap failure remains visible and can be retried', async ({ page }, testInfo) => {
  await installAuthenticatedApp(page);
  let failed = true;
  await page.route('**/api/users/me', async (route) => {
    if (failed) await route.fulfill({ status: 503, json: { message: '登录服务暂时不可用' } });
    else await route.fallback();
  });
  await page.goto('/groups/group-1');
  await expect(page.getByRole('alert')).toContainText('登录服务暂时不可用');
  await page.screenshot({ path: testInfo.outputPath('session-recovery.png'), fullPage: true });
  failed = false;
  await page.getByRole('button', { name: '重试恢复登录' }).click();
  await expect(page.getByTestId('workspace-surface')).toBeVisible();
});

test('message loading failure offers a working retry action', async ({ page }, testInfo) => {
  await installAuthenticatedAppWithOptions(page, { messagesResponse: { status: 503, body: { message: '消息服务暂时不可用' } } });
  await page.goto('/groups/group-1');
  await expect(page.getByRole('alert')).toContainText('消息服务暂时不可用');
  await page.screenshot({ path: testInfo.outputPath('message-recovery.png'), fullPage: true });
  await page.route('**/api/groups/group-1/messages?*', async (route) => route.fulfill({ json: { groupId: 'group-1', items: [] } }));
  await page.getByRole('button', { name: '重试加载消息' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
