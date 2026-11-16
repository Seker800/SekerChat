import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('ADMIN discovers unjoined and archived servers from the server rail', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: { role: 'ADMIN' },
  });
  await page.goto('/groups/group-1');

  const originalGroups = await page.evaluate(async () => {
    const response = await fetch('/api/groups');
    return response.json();
  });
  const baseGroup = originalGroups[0];
  const joinedServer = {
    id: 'server-joined',
    name: '运维',
    avatarUrl: null,
    archivedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  };
  const joinedGroup = {
    ...baseGroup,
    serverId: joinedServer.id,
    category: joinedServer.name,
    server: joinedServer,
  };
  const remoteServer = {
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
  const remoteMember = {
    userId: 'user-admin',
    email: 'admin@local.invalid',
    displayName: '管理员',
    avatarUrl: null,
    role: 'MEMBER',
    isOnline: true,
    joinedAt: '2026-04-06T00:00:00.000Z',
  };
  const remoteChannel = {
    ...baseGroup,
    id: 'remote-channel',
    name: '远端频道',
    category: remoteServer.name,
    serverId: remoteServer.id,
    server: remoteServer,
    currentUserRole: 'MEMBER',
    archivedAt: null,
    updatedAt: '2026-04-05T00:00:00.000Z',
    members: [
      {
        userId: 'user-other',
        email: 'other@local.invalid',
        displayName: '其他成员',
        avatarUrl: null,
        role: 'ADMIN',
        isOnline: false,
        joinedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
  };
  const archivedChannel = {
    ...remoteChannel,
    id: 'remote-archived',
    name: '归档频道',
    category: archivedServer.name,
    serverId: archivedServer.id,
    server: archivedServer,
    archivedAt: archivedServer.archivedAt,
    updatedAt: '2026-04-02T00:00:00.000Z',
  };
  let hasJoined = false;
  const toDiscoverable = (group: typeof remoteChannel) => ({
    ...group,
    memberCount: group.members.length,
    isCurrentUserMember: false,
    canSelfJoin: true,
    currentUserRole: 'MEMBER' as const,
    visibilityReason: group.archivedAt ? 'archived_admin_override' : 'admin_override',
  });

  await page.route('**/api/servers', async (route) => {
    await route.fulfill({
      json: [
        { ...joinedServer, isMember: true },
        { ...remoteServer, isMember: hasJoined },
        { ...archivedServer, isMember: false },
      ],
    });
  });
  await page.route('**/api/groups/admin/discovery**', async (route) => {
    const url = new URL(route.request().url());
    const serverId = url.searchParams.get('serverId');

    if (serverId === archivedServer.id) {
      await route.fulfill({ json: [toDiscoverable(archivedChannel)] });
      return;
    }
    if (serverId === remoteServer.id && !hasJoined) {
      await route.fulfill({ json: [toDiscoverable(remoteChannel)] });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.route(`**/api/groups/${remoteChannel.id}/admin/join`, async (route) => {
    hasJoined = true;
    await route.fulfill({
      json: { ...remoteChannel, members: [...remoteChannel.members, remoteMember] },
    });
  });
  await page.route(`**/api/groups/${remoteChannel.id}`, async (route) => {
    await route.fulfill({
      json: hasJoined
        ? { ...remoteChannel, members: [...remoteChannel.members, remoteMember] }
        : remoteChannel,
    });
  });
  await page.route(`**/api/groups/${archivedChannel.id}`, async (route) => {
    await route.fulfill({ json: archivedChannel });
  });
  await page.route('**/api/groups', async (route) => {
    await route.fulfill({
      json: hasJoined
        ? [joinedGroup, { ...remoteChannel, members: [...remoteChannel.members, remoteMember] }]
        : [joinedGroup],
    });
  });

  await page.reload();
  await page.getByRole('button', { name: '展开 Server 操作' }).click();

  await expect(page.getByText('未加入', { exact: true })).toBeVisible();
  await expect(page.getByText('已归档', { exact: true })).toBeVisible();

  await page.getByTitle('外部项目 · 未加入').click();
  await expect(page).toHaveURL(/\/groups\/remote-channel$/);
  await expect(page.getByText('未加入 (1)', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('groups-sidebar').getByText('远端频道', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('channel-readonly-bar')).toContainText(
    '你尚未加入该频道，加入后可参与讨论。',
  );
  await page.screenshot({ path: 'test-results/admin-server-readonly.png', fullPage: true });

  await page
    .getByTestId('channel-readonly-bar')
    .getByRole('button', { name: '加入频道', exact: true })
    .click();
  await expect(page.getByTestId('channel-readonly-bar')).toHaveCount(0);
  await expect(page.locator('textarea').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-server-joined.png', fullPage: true });

  await page.getByTitle('归档项目 · 已归档').click();
  await expect(page).toHaveURL(/\/groups\/remote-archived$/);
  await expect(
    page.getByTestId('groups-sidebar').getByText('归档频道', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('channel-readonly-bar')).toContainText('该频道已归档，只读。');
  await expect(page.getByRole('button', { name: '加入频道', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/admin-server-archived.png', fullPage: true });
});
