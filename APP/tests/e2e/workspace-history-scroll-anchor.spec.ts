import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

const olderMessagesPage = [
  {
    id: 'message-older-2',
    groupId: 'group-1',
    senderId: 'user-member',
    type: 'text',
    text: '更早的历史消息 B',
    mentionedUserIds: [],
    replyTo: null,
    attachment: null,
    createdAt: '2026-04-03T08:10:00.000Z',
    sender: {
      id: 'user-member',
      email: 'member@local.invalid',
      displayName: '值班同学',
    },
  },
  {
    id: 'message-older-1',
    groupId: 'group-1',
    senderId: 'user-admin',
    type: 'text',
    text: '更早的历史消息 A',
    mentionedUserIds: [],
    replyTo: null,
    attachment: null,
    createdAt: '2026-04-03T08:12:00.000Z',
    sender: {
      id: 'user-admin',
      email: 'admin@local.invalid',
      displayName: '管理员',
    },
  },
];

const initialMessages = [
  {
    id: 'message-2',
    groupId: 'group-1',
    senderId: 'user-admin',
    type: 'text',
    text: '当前可见锚点消息',
    mentionedUserIds: [],
    replyTo: null,
    attachment: null,
    createdAt: '2026-04-03T08:23:00.000Z',
    sender: {
      id: 'user-admin',
      email: 'admin@local.invalid',
      displayName: '管理员',
    },
  },
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `message-tail-${index + 1}`,
    groupId: 'group-1',
    senderId: index % 2 === 0 ? 'user-member' : 'user-admin',
    type: 'text',
    text: `后续消息 ${index + 1} `.repeat(8),
    mentionedUserIds: [],
    replyTo: null,
    attachment: null,
    createdAt: `2026-04-03T08:${String(26 + index).padStart(2, '0')}:00.000Z`,
    sender: {
      id: index % 2 === 0 ? 'user-member' : 'user-admin',
      email: index % 2 === 0 ? 'member@local.invalid' : 'admin@local.invalid',
      displayName: index % 2 === 0 ? '值班同学' : '管理员',
    },
  })),
];

test('keeps the visible message anchored while older history loads', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        nextCursor: 'cursor-older-1',
        items: initialMessages,
      },
    },
  });

  let olderRequestCount = 0;
  let releaseOlderResponse: (() => void) | null = null;
  await page.route('**/api/groups/group-1/messages?cursor=cursor-older-1&limit=50', async (route) => {
    olderRequestCount += 1;
    await new Promise<void>((resolve) => {
      releaseOlderResponse = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groupId: 'group-1',
        nextCursor: null,
        items: olderMessagesPage,
      }),
    });
  });

  await page.goto('/groups/group-1');
  await expect(page.getByTestId('groups-workspace')).toBeVisible();

  const stream = page.getByTestId('workspace-surface');
  const anchor = page.locator('[data-message-id="message-2"]');
  await expect(anchor).toBeVisible();

  await page.evaluate(() => {
    (globalThis as { __historyAnchorSamples?: number[] }).__historyAnchorSamples = [];
  });

  await stream.evaluate((node) => {
    (node as HTMLElement).scrollTop = 0;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  await expect.poll(() => olderRequestCount).toBe(1);

  const topDuringLoading = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  const scrollDuringLoading = await stream.evaluate((node) => (node as HTMLElement).scrollTop);
  const topBefore = await anchor.evaluate((node) => node.getBoundingClientRect().top);

  await page.evaluate((anchorSelector) => {
    const global = globalThis as { __historyAnchorSamples?: number[] };
    const samples = global.__historyAnchorSamples ?? [];
    global.__historyAnchorSamples = samples;
    let frames = 0;
    const sample = () => {
      const anchorNode = document.querySelector(anchorSelector);
      if (anchorNode) {
        samples.push((anchorNode as HTMLElement).getBoundingClientRect().top);
      }
      frames += 1;
      if (frames < 12) {
        window.requestAnimationFrame(sample);
      }
    };
    window.requestAnimationFrame(sample);
  }, '[data-message-id="message-2"]');

  if (!releaseOlderResponse) {
    throw new Error('older history request was not captured');
  }
  releaseOlderResponse();

  await expect(anchor).toBeVisible();
  await page.waitForTimeout(220);
  const topAfter = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  const scrollAfter = await stream.evaluate((node) => (node as HTMLElement).scrollTop);
  const anchorSamples = await page.evaluate(() => (globalThis as { __historyAnchorSamples?: number[] }).__historyAnchorSamples ?? []);
  const maxAnchorDrift = Math.max(...anchorSamples.map((top) => Math.abs(top - topBefore)));

  expect(anchorSamples.length).toBeGreaterThan(0);
  expect(Math.abs(topDuringLoading - topBefore)).toBeLessThanOrEqual(1);
  expect(scrollDuringLoading).toBe(0);
  expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);
  expect(scrollAfter).toBeGreaterThan(0);
  expect(maxAnchorDrift).toBeLessThanOrEqual(1);

  await stream.evaluate((node) => {
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForTimeout(50);
  expect(olderRequestCount).toBe(1);
});
