import { expect, test } from '@playwright/test';
import {
  installAuthenticatedApp,
  installAuthenticatedAppWithOptions,
} from './fixtures/app-fixture';

for (const width of [1440, 760]) {
  test(`editing mentions preserves following text at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await installAuthenticatedApp(page);
    let savedText = '';
    await page.route('**/api/groups/group-1/messages/message-2', async (route) => {
      savedText = route.request().postDataJSON().text;
      await route.fulfill({
        json: {
          id: 'message-2',
          groupId: 'group-1',
          senderId: 'user-admin',
          type: 'text',
          text: savedText,
          mentionedUserIds: ['user-member'],
          replyTo: null,
          attachment: null,
          createdAt: '2026-04-03T08:23:00.000Z',
          editedAt: '2026-04-03T08:24:00.000Z',
          sender: { id: 'user-admin', displayName: '管理员', email: 'admin@local.invalid' },
        },
      });
    });
    await page.goto('/groups/group-1');
    const card = page.locator('[data-message-id="message-2"]');
    await card.click({ button: 'right' });
    await page.getByText('编辑', { exact: true }).click();
    const input = card.locator('textarea');
    await input.fill('请 @值班 后面的文字');
    await input.press('Home');
    for (let i = 0; i < 5; i++) await input.press('ArrowRight');
    await expect(page.getByTestId('mention-dropdown')).toBeVisible();
    await page.screenshot({ path: `test-results/message-edit-mention-${width}.png` });
    await input.press('Enter');
    await expect(input).toHaveValue('请 @值班同学  后面的文字');
    expect(savedText).toBe('');
    await input.press('End');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    expect(savedText).toBe('请 @值班同学  后面的文字');
  });
}

test('archives the default Server and removes it from the active rail', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, { currentUserOverride: { role: 'SUPER_ADMIN' } });
  await page.goto('/groups/group-1');
  const groups = await page.evaluate(async () => (await fetch('/api/groups')).json());
  let archived = false;
  await page.route('**/api/groups', async (route) => {
    await route.fulfill({
      json: [
        {
          ...groups[0],
          serverId: 'default-server',
          category: '未分类',
          server: {
            id: 'default-server',
            name: '未分类',
            archivedAt: archived ? '2026-10-30T00:00:00Z' : null,
          },
          categoryArchivedAt: archived ? '2026-10-30T00:00:00Z' : null,
          archivedAt: '2026-10-23T00:00:00Z',
        },
      ],
    });
  });
  await page.route('**/api/servers/default-server/archive', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ archive: true });
    archived = true;
    await route.fulfill({
      json: {
        serverId: 'default-server',
        name: '未分类',
        category: '未分类',
        archivedAt: '2026-10-30T00:00:00Z',
        groupCount: 1,
      },
    });
  });
  await page.reload();
  const server = page.getByTestId('server-rail-category');
  await expect(server).toHaveAttribute('title', /未分类/);
  await server.click({ button: 'right' });
  await page.getByText('打开 server 设置', { exact: true }).click();
  await page.getByRole('button', { name: '归档此 Server', exact: true }).click();
  await page.getByRole('button', { name: '确认归档', exact: true }).click();
  await expect(page.getByTestId('server-rail-category')).toHaveCount(0);
  expect(archived).toBe(true);
});

test('mention choices remain clickable near the top of the message stream', async ({ page }) => {
  const members = Array.from({ length: 8 }, (_, i) => ({
    userId: `u${i}`,
    displayName: `成员${i}`,
    email: `member${i}@example.test`,
    role: 'MEMBER',
  }));
  await installAuthenticatedAppWithOptions(page, {
    groupsResponse: {
      status: 200,
      body: [
        {
          id: 'group-1',
          name: '测试频道',
          category: '测试',
          artifactConfirmation: {
            isConfirmed: false,
            confirmedAt: null,
            confirmedByUserId: null,
            confirmedByDisplayName: null,
          },
          workState: null,
          isDM: false,
          archivedAt: null,
          updatedAt: '2026-10-30T00:00:00Z',
          createdAt: '2026-10-30T00:00:00Z',
          members,
        },
      ],
    },
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'edge-message',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'text',
            text: '原文',
            mentionedUserIds: [],
            createdAt: '2026-10-30T00:00:00Z',
            sender: { id: 'user-admin', displayName: '管理员', email: 'admin@local.invalid' },
          },
        ],
      },
    },
  });
  await page.goto('/groups/group-1');
  await page.getByTestId('message-card').click({ button: 'right' });
  await page.getByText('编辑', { exact: true }).click();
  await page.getByTestId('message-card').locator('textarea').fill('@');
  const first = page.getByTestId('mention-dropdown').getByRole('button').first();
  await first.click({ timeout: 3000 });
  await expect(page.getByTestId('message-card').locator('textarea')).toHaveValue('@成员0 ');
});
