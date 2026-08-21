import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

const oversizedSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="2400" viewBox="0 0 900 2400">
    <rect width="900" height="2400" fill="#111827" />
    <rect x="80" y="80" width="740" height="2240" rx="48" fill="#2563eb" />
    <text x="450" y="1240" font-size="120" text-anchor="middle" fill="white">preview</text>
  </svg>
`;

test('opens image attachments in fullscreen preview', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'message-image-1',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'image',
            text: null,
            mentionedUserIds: [],
            replyTo: null,
            attachment: {
              id: 'attachment-image-1',
              fileId: 'file-image-1',
              groupId: 'group-1',
              originalName: 'evidence.png',
              mimeType: 'image/png',
              size: 68,
              createdAt: '2026-04-10T12:00:00.000Z',
              contentUrl: 'http://assets.local/previews/evidence.svg',
              metadataUrl: 'http://assets.local/previews/evidence.json',
              uploaderId: 'user-admin',
              kind: 'image',
            },
            createdAt: '2026-04-10T12:00:00.000Z',
            sender: {
              id: 'user-admin',
              email: 'admin@local.invalid',
              displayName: '管理员',
            },
          },
        ],
      },
    },
  });

  await page.route('**/previews/evidence.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: oversizedSvg,
    });
  });

  await page.goto('/groups/group-1');
  await expect(page.getByTestId('groups-workspace')).toBeVisible();

  const previewTrigger = page.getByRole('button', { name: '全屏查看 evidence.png' });
  await expect(previewTrigger).toBeVisible();
  await previewTrigger.click();

  const previewDialog = page.getByRole('dialog', { name: 'evidence.png' });
  await expect(previewDialog).toBeVisible();
  const previewImage = previewDialog.getByRole('img', { name: 'evidence.png' });
  await expect(previewImage).toBeVisible();

  const previewToggle = page.getByTestId('image-preview-toggle');
  await expect(previewToggle).toHaveAttribute('aria-label', 'evidence.png');
  await expect(previewToggle).toHaveAttribute('data-preview-can-pan', 'true');

  await previewToggle.click();
  await expect(previewToggle).toHaveAttribute('aria-label', 'evidence.png');
  await expect(previewToggle).toHaveAttribute('data-preview-can-pan', 'true');

  const offsetBeforeDrag = await previewToggle.getAttribute('data-preview-offset');

  const previewBox = await previewToggle.boundingBox();
  if (!previewBox) {
    throw new Error('preview image is not visible');
  }

  const dragStartX = previewBox.x + previewBox.width / 2;
  const dragStartY = previewBox.y + previewBox.height / 2;
  const dragEndY = dragStartY + 120;

  await previewToggle.dispatchEvent('pointerdown', {
    pointerId: 1,
    clientX: dragStartX,
    clientY: dragStartY,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  });
  await page.evaluate(
    ({ dragStartX: startX, dragStartY: startY, dragEndY: endY }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: startX,
          clientY: endY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: startX,
          clientY: endY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    { dragStartX, dragStartY, dragEndY },
  );

  await expect(async () => {
    const offsetAfterDrag = await previewToggle.getAttribute('data-preview-offset');
    expect(offsetAfterDrag).not.toBe(offsetBeforeDrag);
  }).toPass();

  await page.getByTestId('image-preview-stage').hover({ position: { x: 320, y: 280 } });
  const offsetBeforeWheel = await previewToggle.getAttribute('data-preview-offset');
  await page.mouse.wheel(0, -120);
  await expect(async () => {
    const offsetAfterWheel = await previewToggle.getAttribute('data-preview-offset');
    expect(offsetAfterWheel).not.toBe(offsetBeforeWheel);
  }).toPass();

  await page.getByTestId('image-preview-stage').click({ position: { x: 16, y: 16 } });
  await expect(previewDialog).toHaveCount(0);
});

test('keeps image preview loading separate from failure and retries in place', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'message-image-state-1',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'image',
            text: null,
            mentionedUserIds: [],
            replyTo: null,
            attachment: {
              id: 'attachment-image-state-1',
              fileId: 'file-image-state-1',
              groupId: 'group-1',
              originalName: 'slow-evidence.png',
              mimeType: 'image/png',
              size: 68,
              width: 900,
              height: 2400,
              createdAt: '2026-04-10T12:00:00.000Z',
              contentUrl: 'http://assets.local/previews/state-original.svg',
              thumbnailUrl: 'http://assets.local/previews/state-thumbnail.svg',
              metadataUrl: 'http://assets.local/previews/state-original.json',
              uploaderId: 'user-admin',
              kind: 'image',
            },
            createdAt: '2026-04-10T12:00:00.000Z',
            sender: {
              id: 'user-admin',
              email: 'admin@local.invalid',
              displayName: '管理员',
            },
          },
        ],
      },
    },
  });

  await page.route('**/previews/state-thumbnail.svg', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: oversizedSvg });
  });

  let originalAttempt = 0;
  let releaseFirstResponse = () => undefined;
  let releaseRetryResponse = () => undefined;
  const firstResponseReady = new Promise<void>((resolve) => {
    releaseFirstResponse = resolve;
  });
  const retryResponseReady = new Promise<void>((resolve) => {
    releaseRetryResponse = resolve;
  });

  await page.route('**/previews/state-original.svg', async (route) => {
    originalAttempt += 1;
    if (originalAttempt === 1) await firstResponseReady;
    if (originalAttempt === 2) {
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'temporarily unavailable',
      });
      return;
    }
    if (originalAttempt === 3) await retryResponseReady;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: oversizedSvg,
    });
  });

  await page.goto('/groups/group-1');
  const previewTrigger = page.getByRole('button', { name: '全屏查看 slow-evidence.png' });
  await expect(previewTrigger).toBeVisible();
  await previewTrigger.click();

  const loadingStatus = page.getByRole('status');
  await expect(loadingStatus).toContainText('正在加载大图…');
  await loadingStatus.screenshot({ path: 'test-results/image-preview-loading.png' });
  releaseFirstResponse();
  await expect(page.getByTestId('image-preview-image')).toBeVisible();

  await page.getByTestId('image-preview-backdrop').click({ position: { x: 8, y: 8 } });
  await previewTrigger.click();

  const errorAlert = page.getByRole('alert');
  await expect(errorAlert).toContainText('图片加载失败');
  await errorAlert.screenshot({ path: 'test-results/image-preview-error.png' });
  await errorAlert.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('status')).toContainText('正在加载大图…');
  releaseRetryResponse();
  await expect(page.getByTestId('image-preview-image')).toBeVisible();
  expect(originalAttempt).toBe(3);
});

test('shows replied image thumbnails and opens the original through the page origin', async ({
  page,
}) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'message-reply-image-1',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'text',
            text: '这张图可以继续使用',
            mentionedUserIds: [],
            replyTo: {
              id: 'message-image-origin-1',
              senderId: 'user-member',
              type: 'image',
              textPreview: null,
              sender: {
                id: 'user-member',
                email: 'member@local.invalid',
                displayName: '值班同学',
                avatarUrl: null,
              },
              attachment: {
                id: 'attachment-image-origin-1',
                fileId: 'file-image-origin-1',
                groupId: 'group-1',
                originalName: 'reply-evidence.png',
                mimeType: 'image/png',
                size: 68,
                width: 900,
                height: 2400,
                createdAt: '2026-04-10T11:59:00.000Z',
                contentUrl:
                  'http://backend:3100/api/groups/group-1/files/file-image-origin-1/content',
                thumbnailUrl:
                  'http://backend:3100/api/groups/group-1/files/file-image-origin-1/thumbnail',
                metadataUrl:
                  'http://backend:3100/api/groups/group-1/files/file-image-origin-1/metadata',
                uploaderId: 'user-member',
                kind: 'image',
              },
            },
            attachment: null,
            createdAt: '2026-04-10T12:00:00.000Z',
            sender: {
              id: 'user-admin',
              email: 'admin@local.invalid',
              displayName: '管理员',
              avatarUrl: null,
            },
          },
        ],
      },
    },
  });

  const requestedPaths: string[] = [];
  await page.route('**/api/groups/group-1/files/file-image-origin-1/thumbnail', async (route) => {
    requestedPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: oversizedSvg,
    });
  });
  await page.route('**/api/groups/group-1/files/file-image-origin-1/content', async (route) => {
    requestedPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: oversizedSvg,
    });
  });

  await page.goto('/groups/group-1');

  const thumbnail = page.getByRole('img', { name: 'reply-evidence.png' });
  await expect(thumbnail).toBeVisible();
  expect(requestedPaths).toContain('/api/groups/group-1/files/file-image-origin-1/thumbnail');

  await page.getByRole('button', { name: '全屏查看 reply-evidence.png' }).click();

  await expect(page.getByRole('dialog', { name: 'reply-evidence.png' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'reply-evidence.png' }).getByRole('img'),
  ).toBeVisible();
  expect(requestedPaths).toContain('/api/groups/group-1/files/file-image-origin-1/content');
});

test('reserves image attachment shell height from metadata before the image finishes loading', async ({
  page,
}) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'message-image-1',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'image',
            text: null,
            mentionedUserIds: [],
            replyTo: null,
            attachment: {
              id: 'attachment-image-1',
              fileId: 'file-image-1',
              groupId: 'group-1',
              originalName: 'evidence.png',
              mimeType: 'image/png',
              size: 68,
              width: 900,
              height: 2400,
              createdAt: '2026-04-10T12:00:00.000Z',
              contentUrl: 'http://assets.local/previews/evidence-delayed.svg',
              metadataUrl: 'http://assets.local/previews/evidence-delayed.json',
              uploaderId: 'user-admin',
              kind: 'image',
            },
            createdAt: '2026-04-10T12:00:00.000Z',
            sender: {
              id: 'user-admin',
              email: 'admin@local.invalid',
              displayName: '管理员',
            },
          },
        ],
      },
    },
  });

  await page.route('**/previews/evidence-delayed.svg', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: oversizedSvg,
    });
  });

  await page.goto('/groups/group-1');
  await expect(page.getByTestId('groups-workspace')).toBeVisible();

  const imageShell = page.getByTestId('image-attachment-shell');
  await expect(imageShell).toBeVisible();
  await expect(imageShell).toHaveAttribute(
    'style',
    /width:\s*min\(100%, 120px\);\s*aspect-ratio:\s*120 \/ 320;/,
  );

  const shellBox = await imageShell.boundingBox();
  if (!shellBox) {
    throw new Error('image shell is not visible');
  }

  expect(shellBox.height).toBeGreaterThan(300);
  expect(shellBox.width).toBeGreaterThan(100);
  expect(shellBox.width).toBeLessThan(140);
});

test('loads stable thumbnails from the newest visible messages first and reuses them after channel switches', async ({
  page,
}) => {
  const imageMessages = Array.from({ length: 12 }, (_, index) => ({
    id: `message-image-${index}`,
    groupId: 'group-1',
    senderId: 'user-admin',
    type: 'image',
    text: null,
    mentionedUserIds: [],
    replyTo: null,
    attachment: {
      id: `attachment-image-${index}`,
      fileId: `file-image-${index}`,
      groupId: 'group-1',
      originalName: `image-${index}.png`,
      mimeType: 'image/png',
      size: 68,
      width: 900,
      height: 2400,
      createdAt: `2026-04-10T12:00:${String(index).padStart(2, '0')}.000Z`,
      contentUrl: `http://127.0.0.1:4173/api/groups/group-1/files/file-image-${index}/content`,
      thumbnailUrl: `http://127.0.0.1:4173/api/groups/group-1/files/file-image-${index}/thumbnail`,
      metadataUrl: `http://127.0.0.1:4173/api/groups/group-1/files/file-image-${index}/metadata`,
      uploaderId: 'user-admin',
      kind: 'image',
    },
    createdAt: `2026-04-10T12:00:${String(index).padStart(2, '0')}.000Z`,
    sender: {
      id: 'user-admin',
      email: 'admin@local.invalid',
      displayName: '管理员',
    },
  }));
  const thumbnailRequests: string[] = [];
  const allFileRequests: string[] = [];

  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: { groupId: 'group-1', items: imageMessages },
    },
  });

  page.on('request', (request) => {
    if (request.url().includes('/files/')) allFileRequests.push(request.url());
  });
  await page.route('**/api/groups/group-1/files/*/thumbnail', async (route) => {
    thumbnailRequests.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: oversizedSvg,
    });
  });

  await page.goto('/groups/group-1');
  await expect(page.locator('img[alt^="image-"]')).toHaveCount(4);

  expect(
    await page
      .locator('img[alt^="image-"]')
      .evaluateAll((images) => images.map((image) => image.getAttribute('alt'))),
  ).toEqual(['image-8.png', 'image-9.png', 'image-10.png', 'image-11.png']);
  expect(thumbnailRequests).toHaveLength(4);
  expect(thumbnailRequests.map((url) => /file-image-(\d+)\/thumbnail/.exec(url)?.[1])).toEqual([
    '11',
    '10',
    '9',
    '8',
  ]);
  expect(allFileRequests.some((url) => url.includes('/download-url'))).toBe(false);
  const requestsAfterInitialLoad = thumbnailRequests.length;

  await page.evaluate(() => {
    window.history.pushState({}, '', '/dm/__dm_subscription__');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/dm\/__dm_subscription__$/);
  await expect(page.getByText('SekerChat Desktop 1.0')).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/groups/group-1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/groups\/group-1$/);
  await expect(page.locator('img[alt^="image-"]')).toHaveCount(4);

  expect(thumbnailRequests).toHaveLength(requestsAfterInitialLoad);
});
