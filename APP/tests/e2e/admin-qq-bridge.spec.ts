import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('QQ extension keeps defaults off and requires an explicit backlog choice when enabling two-way sync', async ({
  page,
}) => {
  await installAuthenticatedAppWithOptions(page, { currentUserOverride: { role: 'SUPER_ADMIN' } });
  const binding = {
    id: 'binding',
    connectorId: 'connector',
    groupId: 'group-1',
    accountId: '90000001',
    qqGroupId: '90000002',
    enabled: false,
    bidirectional: false,
    revision: 1,
    enabledAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
  };
  let saved: unknown;
  const overview = {
    extension: { id: 'qq-bridge', name: 'QQ 群同步', version: 1 },
    connectors: [
      {
        id: 'connector',
        name: '模拟连接器',
        enabled: false,
        revokedAt: null,
        lastSeenAt: null,
        connected: false,
        catalog: [],
      },
    ],
    bindings: [binding],
    deliveries: [],
    groups: [{ id: 'group-1', name: '测试频道', category: '测试' }],
  };
  await page.route('**/api/extensions/qq-bridge', (route) => route.fulfill({ json: overview }));
  await page.route('**/api/extensions/qq-bridge/bindings/binding', async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ...binding, ...(saved as object) } });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: '扩展', exact: true }).click();
  await expect(page.getByText('已停用', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设置绑定', exact: true }).click();
  await expect(page.getByLabel('启用同步', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('允许 Chat 普通成员消息发回 QQ')).not.toBeChecked();
  await expect(page.getByLabel('暂停前的积压任务')).toHaveValue('keep-paused');
  await page.getByLabel('启用同步', { exact: true }).check();
  await page.getByLabel('允许 Chat 普通成员消息发回 QQ').check();
  await page.getByRole('button', { name: '保存绑定', exact: true }).click();
  await expect
    .poll(() => saved)
    .toEqual({ enabled: true, bidirectional: true, backlog: 'keep-paused' });
});

test('QQ extension shows errors with retry and displays a new credential only until dismissed', async ({
  page,
}) => {
  await installAuthenticatedAppWithOptions(page, { currentUserOverride: { role: 'SUPER_ADMIN' } });
  let fail = true;
  const token = `qqb_${'a'.repeat(64)}`;
  await page.route('**/api/extensions/qq-bridge', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: '模拟扩展服务暂不可用' } })
      : route.fulfill({
          json: {
            extension: { id: 'qq-bridge', name: 'QQ 群同步', version: 1 },
            connectors: [],
            bindings: [],
            deliveries: [],
            groups: [],
          },
        }),
  );
  await page.route('**/api/extensions/qq-bridge/connectors', (route) =>
    route.fulfill({ status: 201, json: { id: 'connector', token } }),
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: '扩展', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('模拟扩展服务暂不可用');
  fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('button', { name: '创建连接器凭据', exact: true }).click();
  await expect(page.getByLabel('连接器凭据', { exact: true })).toHaveValue(token);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token);
  await page.getByRole('button', { name: '已保存，关闭', exact: true }).click();
  await expect(page.getByLabel('连接器凭据', { exact: true })).toHaveCount(0);
});
