import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

test('preview reports one real transfer, keeps cache reuse, and survives telemetry endpoint failure', async ({
  page,
}) => {
  await installAuthenticatedAppWithOptions(page, {
    messagesResponse: {
      status: 200,
      body: {
        groupId: 'group-1',
        items: [
          {
            id: 'download-log-message',
            groupId: 'group-1',
            senderId: 'user-admin',
            type: 'image',
            text: null,
            mentionedUserIds: [],
            replyTo: null,
            createdAt: '2026-04-10T12:00:00.000Z',
            sender: { id: 'user-admin', email: 'admin@local.invalid', displayName: '管理员' },
            attachment: {
              id: 'diagnostic-file',
              fileId: 'diagnostic-file',
              groupId: 'group-1',
              originalName: 'diagnostic.svg',
              mimeType: 'image/svg+xml',
              size: image.length,
              width: 100,
              height: 100,
              thumbnailStatus: 'READY',
              contentUrl: 'http://127.0.0.1:4173/api/groups/group-1/files/diagnostic-file/content',
              thumbnailUrl:
                'http://127.0.0.1:4173/api/groups/group-1/files/diagnostic-file/thumbnail',
              metadataUrl: 'http://127.0.0.1:4173/api/groups/group-1/files/diagnostic-file',
              uploaderId: 'user-admin',
              kind: 'image',
              createdAt: '2026-04-10T12:00:00.000Z',
            },
          },
        ],
      },
    },
  });
  const rows: any[] = [];
  await page.route('**/api/download-logs', async (route) => {
    rows.push(route.request().postDataJSON());
    // Recording failure must not fail the image or trigger another download.
    await route.fulfill({ status: 503 });
  });
  await page.route('**/files/diagnostic-file/thumbnail', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  );
  await page.route('**/files/diagnostic-file/view-url', (route) =>
    route.fulfill({
      json: { url: 'http://127.0.0.1:4173/api/groups/group-1/files/diagnostic-file/content' },
    }),
  );
  let contents = 0;
  let requestId = '';
  await page.route('**/files/diagnostic-file/content', async (route) => {
    contents++;
    requestId = route.request().headers()['x-download-id'];
    await route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'content-length': String(Buffer.byteLength(image)) },
      body: image,
    });
  });
  await page.goto('/groups/group-1');
  await page.getByRole('button', { name: '全屏查看 diagnostic.svg' }).click();
  await expect(page.getByTestId('image-preview-image')).toBeVisible();
  await expect.poll(() => rows.filter((row) => row.event === 'completed').length).toBe(1);
  expect(rows.find((row) => row.event === 'completed')).toMatchObject({
    downloadId: requestId,
    resourceKind: 'file',
    resourceId: 'diagnostic-file',
    bytes: Buffer.byteLength(image),
  });
  expect(JSON.stringify(rows)).not.toMatch(/playwright-access-token|http:\/\/|diagnostic\.svg/);
  const firstOpenRequests = contents;
  const firstOpenStarts = rows.filter((row) => row.event === 'started').length;
  await page.getByTestId('image-preview-backdrop').click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: '全屏查看 diagnostic.svg' }).click();
  await expect(page.getByTestId('image-preview-image')).toBeVisible();
  expect(contents).toBe(firstOpenRequests);
  expect(rows.filter((row) => row.event === 'started')).toHaveLength(firstOpenStarts);
  expect(rows.filter((row) => row.event === 'completed')).toHaveLength(1);
  await page.screenshot({ path: 'test-results/download-diagnostics-preview.png' });
});

test('cookie download saves through content route without loading the file into JavaScript', async ({
  page,
}) => {
  let contents = 0;
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/download-url')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ url: 'https://unreachable.invalid/signed?secret=never-use' }));
    } else if (request.url?.endsWith('/content')) {
      contents++;
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="native.txt"',
      });
      response.end('native bytes');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Native download verification</title>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await page.goto(origin);
    const download = page.waitForEvent('download');
    await page.evaluate(async () => {
      const { downloadFile, BROWSER_COOKIE_CREDENTIAL } =
        await import('http://127.0.0.1:4173/src/lib/api-core.ts');
      await downloadFile('/api/groups/g/files/f/content', 'native.txt', BROWSER_COOKIE_CREDENTIAL);
    });
    const result = await download;
    expect(result.url()).toBe(`${origin}/api/groups/g/files/f/content`);
    expect(result.suggestedFilename()).toBe('native.txt');
    expect(await result.failure()).toBeNull();
    expect(contents).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
