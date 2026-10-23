import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

test('long history mounts a bounded viewport and remains browsable while typing', async ({
  page,
}, testInfo) => {
  const items = Array.from({ length: 1000 }, (_, index) => ({
    id: `long-${index}`,
    groupId: 'group-1',
    senderId: 'user-member',
    type: 'text',
    text: `历史消息 ${index}`,
    mentionedUserIds: [],
    replyTo:
      index === 999
        ? {
            id: 'long-0',
            senderId: 'user-member',
            type: 'text',
            textPreview: '回到首条',
            sender: { id: 'user-member', email: 'member@local.invalid', displayName: '值班同学' },
          }
        : null,
    attachment: null,
    createdAt: new Date(Date.UTC(2026, 9, 23, 0, index)).toISOString(),
    sender: { id: 'user-member', email: 'member@local.invalid', displayName: '值班同学' },
  }));
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: { status: 200, body: { groupId: 'group-1', nextCursor: null, items } },
  });
  await page.goto('/groups/group-1');
  const stream = page.getByTestId('workspace-surface');
  await expect(stream).toBeVisible();
  await expect(page.locator('[data-message-id="long-999"]')).toBeVisible();
  await expect.poll(() => stream.locator('[data-message-id]').count()).toBeLessThan(100);
  await page.getByTestId('message-composer').fill('连续输入，不重绘历史');
  await expect(page.getByTestId('message-composer')).toHaveValue('连续输入，不重绘历史');
  await page.locator('[data-message-id="long-999"] button').filter({ hasText: '回到首条' }).click();
  await expect(page.locator('[data-message-id="long-0"]')).toBeVisible();
  await expect.poll(() => stream.locator('[data-message-id]').count()).toBeLessThan(100);
  await page.screenshot({ path: testInfo.outputPath('long-history.png') });
});

for (const initialLength of [90, 160]) {
  test(`history preserves the visible anchor when prepending across ${initialLength} messages`, async ({
    page,
  }) => {
    const message = (index: number) => ({
      id: `anchor-${index}`,
      groupId: 'group-1',
      senderId: index % 2 ? 'user-member' : 'user-admin',
      type: 'text',
      text: `历史锚点 ${index} ` + '有长有短的消息内容'.repeat(index % 9),
      mentionedUserIds: [],
      replyTo: null,
      attachment: null,
      createdAt: new Date(Date.UTC(2026, 9, 23, 0, index)).toISOString(),
      sender: {
        id: index % 2 ? 'user-member' : 'user-admin',
        email: 'member@local.invalid',
        displayName: '值班同学',
      },
    });
    await installAuthenticatedAppWithOptions(page, {
      messagesResponse: {
        status: 200,
        body: {
          groupId: 'group-1',
          nextCursor: 'older-virtual',
          items: Array.from({ length: initialLength }, (_, i) => message(i + 30)),
        },
      },
    });
    let release: (() => void) | undefined;
    await page.route(
      '**/api/groups/group-1/messages?cursor=older-virtual&limit=50',
      async (route) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({
          json: {
            groupId: 'group-1',
            nextCursor: null,
            items: Array.from({ length: 30 }, (_, i) => message(i)),
          },
        });
      },
    );
    await page.goto('/groups/group-1');
    const stream = page.getByTestId('workspace-surface');
    await expect(page.locator(`[data-message-id="anchor-${initialLength + 29}"]`)).toBeVisible();
    await stream.evaluate((node) => {
      node.scrollTop = 0;
      node.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => Boolean(release)).toBe(true);
    const anchor = page.locator('[data-message-id="anchor-30"]');
    await expect(anchor).toBeVisible();
    const before = await anchor.evaluate((node) => node.getBoundingClientRect().top);
    release!();
    await expect
      .poll(async () =>
        Math.abs((await anchor.evaluate((node) => node.getBoundingClientRect().top)) - before),
      )
      .toBeLessThan(3);
    await expect.poll(() => stream.locator('[data-message-id]').count()).toBeLessThan(100);
  });
}
