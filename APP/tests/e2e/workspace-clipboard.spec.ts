import { expect, test, type Page } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';
import { createLargeRasterPng } from './fixtures/large-raster';

const imageBytes = createLargeRasterPng(160, 90);
const image = `data:image/png;base64,${imageBytes.toString('base64')}`;

async function setup(page: Page, failImage = false) {
  await installAuthenticatedAppWithOptions(page);
  await page.route('**/paste-image.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: imageBytes }),
  );
  const messages: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  let uploadCount = 0;
  const attachment = {
    id: 'file-paste',
    fileId: 'file-paste',
    groupId: 'group-1',
    originalName: 'clipboard.png',
    mimeType: 'image/png',
    size: imageBytes.length,
    width: 160,
    height: 90,
    kind: 'image',
    kindLabel: 'image',
    contentUrl: 'http://assets.local/paste-image.png',
    thumbnailUrl: 'http://assets.local/paste-image.png',
    thumbnailStatus: 'READY',
    uploaderId: 'user-admin',
    createdAt: new Date().toISOString(),
  };
  await page.route('**/api/uploads/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith('/initiate')) {
      uploadCount++;
      body = { id: 'paste-upload', partSizeBytes: 33554432, createdAt: new Date().toISOString() };
    } else if (path.endsWith('/complete')) body = { kind: 'CHAT_ATTACHMENT', file: attachment };
    else body = { uploadSessionId: 'paste-upload', partNumber: 1, etag: 'etag-paste', parts: [] };
    await route.fulfill({ json: body });
  });
  await page.route('**/api/groups/group-1/messages*', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      requests.push(input);
      if (failImage && input.type === 'image') {
        failImage = false;
        await route.fulfill({ status: 503, json: { message: '图片消息暂时发送失败' } });
        return;
      }
      const message = {
        ...input,
        id: `paste-${messages.length}`,
        groupId: 'group-1',
        senderId: 'user-admin',
        text: input.text ?? null,
        attachment: input.type === 'image' ? attachment : null,
        sender: { id: 'user-admin', email: 'admin@local.invalid', displayName: '管理员' },
        mentionedUserIds: [],
        replyTo: null,
        readReceipt: null,
        revokedAt: null,
        editedAt: null,
        createdAt: new Date(Date.now() + messages.length).toISOString(),
      };
      messages.push(message);
      await route.fulfill({ json: message });
    } else await route.fulfill({ json: { groupId: 'group-1', items: messages } });
  });
  await page.goto('/groups/group-1');
  await expect(page.getByTestId('message-composer')).toBeVisible();
  return { requests, getUploadCount: () => uploadCount };
}

async function paste(page: Page, html: string) {
  await page.getByTestId('message-composer').evaluate((element, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html);
    data.setData('text/plain', '开头说明\n结尾说明');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, html);
}

test('mixed paste sends text and images in order while preserving the existing draft', async ({
  page,
}) => {
  const { requests } = await setup(page);
  await page.getByTestId('message-composer').fill('尚未发送的草稿');
  await paste(page, `<p>开头说明</p><img src="${image}"><p>结尾说明</p>`);
  await expect.poll(() => requests.length).toBe(3);
  expect(requests.map((item) => item.type)).toEqual(['text', 'image', 'text']);
  await expect(page.getByText('开头说明', { exact: true })).toBeVisible();
  await expect(page.getByText('结尾说明', { exact: true })).toBeVisible();
  const picture = page.getByRole('button', { name: /全屏查看 clipboard/ }).getByRole('img');
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(160);
  const before = await page.getByText('开头说明', { exact: true }).boundingBox();
  const middle = await picture.boundingBox();
  const after = await page.getByText('结尾说明', { exact: true }).boundingBox();
  expect(before!.y).toBeLessThan(middle!.y);
  expect(middle!.y).toBeLessThan(after!.y);
  await expect(page.getByTestId('message-composer')).toHaveValue('尚未发送的草稿');
  await expect(page.getByTestId('clipboard-batch-status')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/clipboard-success.png' });
});

test('failed mixed paste exposes progress and resumes without duplicate uploads or text', async ({
  page,
}) => {
  const { requests, getUploadCount } = await setup(page, true);
  await paste(page, `<p>开头说明</p><img src="${image}"><p>结尾说明</p>`);
  await expect(page.getByTestId('clipboard-batch-status')).toContainText('已发送 1 / 3 条');
  await expect(page.getByTestId('clipboard-batch-status')).toContainText('图片消息暂时发送失败');
  await page.screenshot({ path: 'test-results/clipboard-failure.png' });
  await page.getByRole('button', { name: '继续发送', exact: true }).click();
  await expect.poll(() => requests.length).toBe(4);
  await expect(page.getByTestId('clipboard-batch-status')).toHaveCount(0);
  expect(requests[2]).toEqual(requests[1]);
  expect(getUploadCount()).toBe(1);
});

test('unreadable source images are reported before any text is sent', async ({ page }) => {
  const { requests } = await setup(page);
  await paste(page, '<p>不能单独发出</p><img src="file:///private/source.png"><p>结束</p>');
  await expect(page.getByTestId('clipboard-batch-status')).toContainText('图片无法读取');
  expect(requests).toHaveLength(0);
});
