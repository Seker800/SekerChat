import { expect, test } from '@playwright/test';
import {
  installAuthenticatedApp,
  installAuthenticatedAppWithOptions,
} from './fixtures/app-fixture';

async function captureRealtime(page: import('@playwright/test').Page) {
  // Extend the fixture socket rather than opening any network connection.
  await page.addInitScript(() => {
    const Base = window.WebSocket;
    class TestSocket extends Base {
      constructor(url: string | URL) {
        super(url);
        (window as unknown as { __consistencySocket: WebSocket }).__consistencySocket = this;
      }
    }
    window.WebSocket = TestSocket;
  });
}

const message = (index: number) => ({
  id: `history-${index}`,
  groupId: 'group-1',
  senderId: 'user-member',
  type: 'text',
  text: `历史记录 ${index}`,
  eventSequence: String(index + 1),
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: new Date(Date.UTC(2026, 3, 3, 8, index)).toISOString(),
  sender: {
    id: 'user-member',
    email: 'member@local.invalid',
    displayName: '值班同学',
    avatarUrl: null,
  },
});

test('restores independent drafts through actual workspace navigation', async ({
  page,
}, testInfo) => {
  const groups = ['运维', '设计'].map((name, index) => ({
    id: `group-${index + 1}`,
    serverId: `server-${index + 1}`,
    category: name,
    name,
    isDM: false,
    members: [],
    unreadCount: 0,
    archivedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    workState: null,
    latestMessage: null,
    currentUserRole: 'ADMIN',
    createdById: 'user-admin',
    serverAvatarUrl: null,
    artifactConfirmation: {
      isConfirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      confirmedByDisplayName: null,
    },
  }));
  await installAuthenticatedAppWithOptions(page, { groupsResponse: { status: 200, body: groups } });
  await page.goto('/groups/group-1');
  const composer = page.getByTestId('message-composer');
  await expect(composer).toBeVisible();
  await composer.fill('运维频道未发送草稿');
  await page.getByTitle(/^设计 ·/).click();
  await expect(page).toHaveURL(/\/groups\/group-2$/);
  await expect(composer).toHaveValue('');
  await composer.fill('设计频道独立草稿');
  await page.getByTitle(/^运维 ·/).click();
  await expect(page).toHaveURL(/\/groups\/group-1$/);
  await expect(composer).toHaveValue('运维频道未发送草稿');
  await page.screenshot({ path: testInfo.outputPath('restored-conversation-draft.png') });
});

test('retains loaded history and scroll position across a realtime-triggered refresh', async ({
  page,
}, testInfo) => {
  await installAuthenticatedApp(page);
  await captureRealtime(page);
  let latestRequests = 0;
  await page.route('**/api/groups/group-1/messages?**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (cursor)
      await route.fulfill({
        json: { groupId: 'group-1', items: [message(0), message(1)], nextCursor: null },
      });
    else {
      latestRequests++;
      await route.fulfill({
        json: {
          groupId: 'group-1',
          items: Array.from({ length: 30 }, (_, i) => message(i + 2)),
          nextCursor: 'older',
        },
      });
    }
  });
  await page.goto('/groups/group-1');
  const stream = page.getByTestId('workspace-surface');
  await expect(page.locator('[data-message-id="history-31"]')).toBeVisible();
  await stream.evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('[data-message-id="history-0"]')).toBeAttached();
  const anchor = page.locator('[data-message-id="history-2"]');
  await expect(anchor).toBeVisible();
  const before = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  await page.evaluate(() => {
    const socket = (window as unknown as { __consistencySocket: WebSocket }).__consistencySocket;
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          eventVersion: 1,
          eventId: 'refresh-share',
          type: 'group.updated.v1',
          groupId: 'group-1',
          occurredAt: '2026-10-30T00:00:00Z',
          payload: { groupId: 'group-1', reason: 'file_share_updated' },
        }),
      }),
    );
  });
  await expect.poll(() => latestRequests).toBe(2);
  await expect(page.locator('[data-message-id="history-0"]')).toBeAttached();
  await expect
    .poll(async () =>
      Math.abs((await anchor.evaluate((node) => node.getBoundingClientRect().top)) - before),
    )
    .toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('history-after-refresh.png') });
});

test('does not overwrite an unsaved channel name when presence changes', async ({
  page,
}, testInfo) => {
  await installAuthenticatedApp(page);
  await captureRealtime(page);
  await page.goto('/groups/group-1');
  await page.locator('[data-group-id="group-1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '打开频道设置' }).click();
  const field = page.getByTestId('rename-group-field');
  await field.fill('仍未保存的频道名称');
  await page.evaluate(() => {
    const socket = (window as unknown as { __consistencySocket: WebSocket }).__consistencySocket;
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          eventVersion: 1,
          eventId: 'presence-while-editing',
          type: 'presence.changed.v1',
          groupId: 'group-1',
          occurredAt: '2026-10-30T00:00:00Z',
          payload: { userId: 'user-member', online: false, isDnd: false },
        }),
      }),
    );
  });
  await expect(field).toHaveValue('仍未保存的频道名称');
  await page.screenshot({ path: testInfo.outputPath('settings-after-presence.png') });
});
