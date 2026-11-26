import { expect, test, type Page } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

const joinedServer = {
  id: 'server-joined',
  name: '运维',
  avatarUrl: null,
  archivedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-03T00:00:00.000Z',
};
const unjoinedServer = {
  id: 'server-unjoined',
  name: '外部项目',
  avatarUrl: null,
  archivedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-05T00:00:00.000Z',
};
const archivedServer = {
  id: 'server-archived',
  name: '归档项目',
  avatarUrl: null,
  archivedAt: '2026-04-02T00:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-04-02T00:00:00.000Z',
};

async function installServerVisibilityApp(
  page: Page,
  role: 'ADMIN' | 'SUPER_ADMIN',
  onHide?: (serverId: string, payload: unknown) => void,
) {
  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: { role },
  });
  await page.goto('/groups/group-1');

  const originalGroups = await page.evaluate(async () => {
    const response = await fetch('/api/groups');
    return response.json();
  });
  const baseGroup = originalGroups[0];
  const joinedGroup = {
    ...baseGroup,
    serverId: joinedServer.id,
    category: joinedServer.name,
    server: joinedServer,
  };

  let servers = [
    { ...joinedServer, isMember: true },
    { ...unjoinedServer, isMember: false },
    { ...archivedServer, isMember: false },
  ];

  await page.route('**/api/servers', async (route) => {
    await route.fulfill({ json: servers });
  });
  await page.route('**/api/servers/*/hidden', async (route) => {
    const serverId = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    const payload = route.request().postDataJSON();
    onHide?.(serverId, payload);
    servers = servers.filter((server) => server.id !== serverId);
    await route.fulfill({
      json: {
        serverId,
        name: serverId === unjoinedServer.id ? unjoinedServer.name : archivedServer.name,
        hiddenAt: '2026-04-10T12:00:00.000Z',
        archivedAt: serverId === archivedServer.id ? archivedServer.archivedAt : null,
        groupCount: 0,
      },
    });
  });
  await page.route('**/api/groups', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [joinedGroup] });
  });

  await page.reload();
  await page.getByRole('button', { name: '展开 Server 操作' }).click();
}

test('SUPER_ADMIN can hide an unjoined Server from the rail', async ({ page }) => {
  const hideCalls: Array<{ serverId: string; payload: unknown }> = [];
  await installServerVisibilityApp(page, 'SUPER_ADMIN', (serverId, payload) => {
    hideCalls.push({ serverId, payload });
  });

  const unjoinedItem = page.getByTitle('外部项目 · 未加入');
  await expect(unjoinedItem).toBeVisible();
  await unjoinedItem.click({ button: 'right' });

  await page.getByRole('menuitem', { name: '隐藏 Server' }).click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('隐藏后它将从所有列表、搜索和发现中消失');
  await dialog.getByRole('button', { name: '隐藏', exact: true }).click();

  await expect(page.getByTitle('外部项目 · 未加入')).toHaveCount(0);
  await expect(page.getByTitle('归档项目 · 已归档')).toBeVisible();
  expect(hideCalls).toEqual([{ serverId: unjoinedServer.id, payload: { hidden: true } }]);
});

test('ADMIN does not see the hide action', async ({ page }) => {
  await installServerVisibilityApp(page, 'ADMIN');

  await page.getByTitle('外部项目 · 未加入').click({ button: 'right' });

  await expect(page.getByRole('menuitem', { name: '隐藏 Server' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: '打开 server 设置' })).toBeVisible();
});
