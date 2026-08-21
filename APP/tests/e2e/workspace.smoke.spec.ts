import { expect, test } from '@playwright/test';
import {
  installAuthenticatedApp,
  installAuthenticatedAppWithOptions,
} from './fixtures/app-fixture';

test.describe('review web smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedApp(page);
    await page.route('**/api/attendance/me/checkin/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workDate: '2026-05-14',
          status: 'NOT_CHECKED_IN',
          checkInAt: null,
          checkOutAt: null,
          checkInMinutes: 0,
          onlineMinutes: 110,
        }),
      });
    });
    await page.route('**/api/attendance/me/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workDate: '2026-05-14',
          mode: 'FLEXIBLE',
          dayWorkedMinutes: 110,
          previousWorkDate: '2026-05-13',
          previousDayWorkedMinutes: 70,
          weekWorkedMinutes: 420,
          weekAverageDailyWorkedMinutes: 84,
          monthWorkedMinutes: 900,
          monthAverageDailyWorkedMinutes: 64,
          weekStartDate: '2026-05-11',
          weekEndDate: '2026-05-17',
          monthStartDate: '2026-05-01',
          monthEndDate: '2026-05-31',
        }),
      });
    });
    await page.goto('/groups/group-1');
    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByTestId('workspace-surface')).toBeVisible();
    await expect(page.getByTestId('workspace-composer-panel')).toBeVisible();
    await expect(page.locator('[data-group-id="group-1"]')).toBeVisible();
    await expect(page.locator('[data-group-id="group-2"]')).toHaveCount(0);
    await expect(page.getByText('当前会话', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('message-card')).toHaveCount(2);
    await expect(page.getByTestId('attendance-popover')).toBeVisible();
  });

  test('captures the workspace view with mocked live data', async ({ page }) => {
    await expect(page).toHaveScreenshot('workspace-overview.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
  });

  test('returns from management to the first active channel when archived data is listed first', async ({
    page,
  }) => {
    const activeGroups = await page.evaluate(async () => {
      const response = await fetch('/api/groups');
      return response.json() as Promise<Array<Record<string, unknown>>>;
    });
    const archivedGroup = {
      ...activeGroups[0],
      id: 'archived-group',
      name: '已归档频道',
      archivedAt: '2026-04-09T08:00:00.000Z',
    };

    await page.route('**/api/groups', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([archivedGroup, ...activeGroups]),
      });
    });

    await page.goto('/admin');
    await page.reload();
    await page.getByRole('link', { name: '返回频道' }).click();

    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.locator('[data-group-id="group-1"]')).toBeVisible();
    await expect(page.getByPlaceholder('发送消息到 #值班提醒群')).toBeVisible();
  });

  test('wraps long markdown content without introducing horizontal overflow', async ({ page }) => {
    await installAuthenticatedAppWithOptions(page, {
      messagesResponse: {
        status: 200,
        body: {
          groupId: 'group-1',
          items: [
            {
              id: 'message-long-markdown',
              groupId: 'group-1',
              senderId: 'user-member',
              type: 'text',
              text: '`averyveryveryveryveryveryveryveryveryveryverylongtokenwithoutspacesaveryveryveryveryveryveryveryveryveryveryverylongtokenwithoutspaces`',
              mentionedUserIds: [],
              replyTo: null,
              attachment: null,
              createdAt: '2026-04-03T08:20:00.000Z',
              sender: {
                id: 'user-member',
                email: 'member@local.invalid',
                displayName: '值班同学',
              },
            },
          ],
        },
      },
    });

    await page.goto('/groups/group-1');
    await expect(page.getByTestId('groups-workspace')).toBeVisible();

    const overflow = await page.locator('[data-testid="message-card"]').evaluate((node) => {
      const message = node as HTMLElement;
      const stream = message.closest('[class*="stream"]') as HTMLElement | null;
      const content = message.querySelector('[class*="content"]') as HTMLElement | null;
      return {
        streamOverflowX: stream ? stream.scrollWidth > stream.clientWidth : null,
        contentOverflowX: content ? content.scrollWidth > content.clientWidth : null,
      };
    });

    expect(overflow.streamOverflowX).toBe(false);
    expect(overflow.contentOverflowX).toBe(false);
  });

  test('shows add-to-artifacts actions beside attachments while the channel is packaging', async ({
    page,
  }) => {
    await page.route('**/fixture-design.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#5865f2"/><circle cx="400" cy="300" r="120" fill="#ffd93d"/></svg>',
      });
    });
    await installAuthenticatedAppWithOptions(page, {
      workStateResponse: {
        status: 200,
        body: {
          id: 'work-state-1',
          groupId: 'group-1',
          status: '打包',
          reason: '',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      },
      messagesResponse: {
        status: 200,
        body: {
          groupId: 'group-1',
          items: [
            {
              id: 'message-image',
              groupId: 'group-1',
              senderId: 'user-member',
              type: 'image',
              text: null,
              mentionedUserIds: [],
              replyTo: null,
              attachment: {
                id: 'file-image',
                fileId: 'file-image',
                groupId: 'group-1',
                originalName: 'design.png',
                mimeType: 'image/png',
                size: 1024,
                width: 800,
                height: 600,
                createdAt: '2026-04-10T10:00:00.000Z',
                contentUrl: '/fixture-design.svg',
                metadataUrl: '/api/groups/group-1/files/file-image',
                uploaderId: 'user-member',
                kind: 'image',
                thumbnailUrl: null,
              },
              readReceipt: null,
              revokedAt: null,
              editedAt: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              sender: { id: 'user-member', email: 'member@local.invalid', displayName: '值班同学' },
            },
            {
              id: 'message-file',
              groupId: 'group-1',
              senderId: 'user-member',
              type: 'file',
              text: null,
              mentionedUserIds: [],
              replyTo: null,
              attachment: {
                id: 'file-zip',
                fileId: 'file-zip',
                groupId: 'group-1',
                originalName: 'release.zip',
                mimeType: 'application/zip',
                size: 4096,
                createdAt: '2026-04-10T10:01:00.000Z',
                contentUrl: '/api/groups/group-1/files/file-zip/content',
                metadataUrl: '/api/groups/group-1/files/file-zip',
                uploaderId: 'user-member',
                kind: 'file',
                thumbnailUrl: null,
              },
              readReceipt: null,
              revokedAt: null,
              editedAt: null,
              createdAt: '2026-04-10T10:01:00.000Z',
              sender: { id: 'user-member', email: 'member@local.invalid', displayName: '值班同学' },
            },
          ],
        },
      },
    });

    await page.goto('/groups/group-1');
    await expect(page.getByRole('button', { name: '添加到产出' })).toHaveCount(2);
    await expect(page.getByTestId('workspace-surface')).toHaveScreenshot(
      'workspace-packaging-artifact-actions.png',
      {
        animations: 'disabled',
        caret: 'hide',
      },
    );
  });

  test('removes ai runtime surfaces from the workspace shell', async ({ page }) => {
    await expect(page.getByTestId('global-ai-runtime-status')).toHaveCount(0);
    await expect(page.getByTestId('workspace-group-review-status')).toHaveCount(0);
    await expect(page.getByTestId('workspace-observability-drawer')).toHaveCount(0);
    await expect(page.getByTestId('open-group-discovery-button')).toHaveCount(0);
    await expect(page.getByTestId('open-artifacts-surface-button')).toHaveCount(0);
    await expect(page.getByTestId('open-manage-surface-button')).toHaveCount(0);
  });

  test('captures the sidebar density and truncation baseline', async ({ page }) => {
    await expect(page.getByTestId('server-rail-category').first()).toHaveAttribute(
      'title',
      /运维 · 1 个活跃频道/,
    );
    await expect(page.getByTestId('groups-sidebar')).toHaveScreenshot('workspace-sidebar.png', {
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('shows compact article previews and confirms only from full details', async ({ page }) => {
    await page.goto('/dm/__dm_subscription__');

    await expect(page.getByRole('button', { name: /出勤/ })).toBeVisible();
    const articleNavButton = page
      .getByTestId('groups-sidebar')
      .getByRole('button', { name: /文章/ });
    await expect(articleNavButton).toBeVisible();
    await expect(page.getByText('文章信息')).toHaveCount(0);
    await expect(page.getByTestId('open-info-sidebar-button')).toHaveCount(0);
    const subscriptionGridColumns = await page
      .getByTestId('groups-workspace')
      .evaluate((workspace) => getComputedStyle(workspace).gridTemplateColumns.split(' ').length);
    expect(subscriptionGridColumns).toBe(3);
    await expect(page.getByRole('button', { name: '全部' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '未读' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下载', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '已置顶' })).toHaveCount(0);
    await expect(
      page.getByTestId('subscription-card-title-row-subscription-post-1').getByRole('heading'),
    ).toHaveText('SekerChat Desktop 1.0');
    await expect(
      page.getByTestId('subscription-card-title-row-subscription-post-1').locator('time'),
    ).toBeVisible();
    await expect(page.getByText('SekerChat Desktop 1.0')).toBeVisible();
    await expect(page.getByText('文章使用指南')).toBeVisible();
    await expect(page.getByText('七月维护通知')).toBeVisible();
    await expect(articleNavButton.getByText('2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '发布' })).toBeVisible();
    await expect(page.getByText('#桌面端')).toHaveCount(0);
    await expect(page.getByText('#更新')).toHaveCount(0);
    await expect(page.getByText('阅读详情')).toHaveCount(0);
    await expect(page.getByText('Desktop 1.0 更新说明')).toHaveCount(0);

    await expect(page.getByRole('checkbox')).toHaveCount(0);
    const compactRowMetrics = await page
      .getByTestId('subscription-card-subscription-post-1')
      .evaluate((row) => {
        const rowStyle = getComputedStyle(row);
        const openStyle = getComputedStyle(row.querySelector('button')!);
        const timeStyle = getComputedStyle(row.querySelector('time')!);
        const titleStyle = getComputedStyle(row.querySelector('h2')!);
        const summaryStyle = getComputedStyle(row.querySelector('p')!);
        return {
          borderWidth: Number.parseFloat(rowStyle.borderWidth),
          borderRadius: Number.parseFloat(rowStyle.borderRadius),
          horizontalPadding: Number.parseFloat(openStyle.paddingLeft),
          timeFontSize: Number.parseFloat(timeStyle.fontSize),
          titleColor: titleStyle.color,
          summaryColor: summaryStyle.color,
          summaryFontSize: Number.parseFloat(summaryStyle.fontSize),
          summaryOpacity: Number.parseFloat(summaryStyle.opacity),
        };
      });
    const articleFeedMetrics = await page.getByTestId('article-feed').evaluate((feed) => {
      const feedStyle = getComputedStyle(feed);
      return {
        borderWidth: Number.parseFloat(feedStyle.borderWidth),
        borderRadius: Number.parseFloat(feedStyle.borderRadius),
        rowGap: Number.parseFloat(feedStyle.rowGap),
      };
    });
    expect(compactRowMetrics.borderWidth).toBeLessThanOrEqual(1);
    expect(compactRowMetrics.borderRadius).toBeLessThanOrEqual(1);
    expect(compactRowMetrics.horizontalPadding).toBeGreaterThanOrEqual(14);
    expect(compactRowMetrics.timeFontSize).toBeLessThanOrEqual(11);
    expect(compactRowMetrics.summaryColor).not.toBe(compactRowMetrics.titleColor);
    expect(compactRowMetrics.summaryFontSize).toBeLessThanOrEqual(12);
    expect(compactRowMetrics.summaryOpacity).toBeLessThanOrEqual(0.8);
    expect(articleFeedMetrics.borderWidth).toBeGreaterThanOrEqual(1);
    expect(articleFeedMetrics.borderRadius).toBeGreaterThanOrEqual(12);
    expect(articleFeedMetrics.rowGap).toBe(0);

    const articleBackground = await page.getByTestId('article-page').evaluate((articlePage) => ({
      color: getComputedStyle(articlePage).backgroundColor,
      image: getComputedStyle(articlePage).backgroundImage,
    }));
    expect(articleBackground.color).toBe('rgb(43, 45, 49)');
    expect(articleBackground.image).toContain('radial-gradient');
    expect(articleBackground.image).toContain('linear-gradient');

    const confirmedCard = page.getByTestId('subscription-card-subscription-post-2');
    await expect(confirmedCard.getByText('在这里可以统一查看团队发布的资料与更新。')).toBeVisible();
    expect(await confirmedCard.evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
    const pendingBackground = await page
      .getByTestId('subscription-card-subscription-post-1')
      .evaluate((card) => getComputedStyle(card).backgroundImage);
    expect(pendingBackground).toContain('0.24');
    expect(await confirmedCard.evaluate((card) => getComputedStyle(card).backgroundImage)).toBe(
      'none',
    );
    await confirmedCard.hover();
    const hoverBackground = await confirmedCard.evaluate(
      (card) => getComputedStyle(card).backgroundImage,
    );
    expect(hoverBackground).toContain('rgba(226, 232, 230, 0.22)');
    await page.screenshot({
      path: 'test-results/article-hover.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    await page.getByRole('button', { name: '0/2 已确认已读，查看名单' }).first().click();
    await expect(page.getByRole('dialog', { name: '确认已读名单' })).toBeVisible();
    await page.screenshot({
      path: 'test-results/article-confirmation-list.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
    await page
      .getByRole('dialog', { name: '确认已读名单' })
      .getByRole('button', { name: '关闭' })
      .click();

    await page.screenshot({
      path: 'test-results/subscription-list.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('article-page')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: 'test-results/article-list-narrow.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.getByRole('button', { name: '打开未确认文章 SekerChat Desktop 1.0' }).click();
    await expect(page.getByRole('heading', { name: 'Desktop 1.0 更新说明' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /下载 SekerChat-Desktop-1.0.zip/ }),
    ).toBeVisible();
    const readingView = page.getByTestId('subscription-reading-view');
    const articleFileCard = readingView.getByTestId('file-attachment-card');
    await expect(articleFileCard).toBeVisible();
    await expect(articleFileCard.getByText('SekerChat-Desktop-1.0.zip')).toBeVisible();
    await expect(articleFileCard.getByText('700.0 MB')).toBeVisible();
    await expect(articleFileCard.getByRole('button')).toHaveCount(1);
    await expect(readingView.getByText('#桌面端')).toHaveCount(0);
    await expect(readingView.getByText('待确认')).toHaveCount(0);
    await expect(readingView.getByText('已确认')).toHaveCount(0);
    await page.getByRole('button', { name: '确认已读' }).click();
    await expect(readingView.getByText(/已于.*确认已读/)).toBeVisible();
    await expect(articleNavButton.getByText('1', { exact: true })).toBeVisible();

    const readingMetrics = await readingView.evaluate((detail) => {
      const detailStyle = getComputedStyle(detail);
      const timeStyle = getComputedStyle(detail.querySelector('time')!);
      const fileCardStyle = getComputedStyle(
        detail.querySelector('[data-testid="file-attachment-card"]')!,
      );
      return {
        borderWidth: Number.parseFloat(detailStyle.borderWidth),
        borderRadius: Number.parseFloat(detailStyle.borderRadius),
        timeFontSize: Number.parseFloat(timeStyle.fontSize),
        fileCardBorderRadius: Number.parseFloat(fileCardStyle.borderRadius),
        fileCardMaxWidth: Number.parseFloat(fileCardStyle.maxWidth),
      };
    });
    expect(readingMetrics.borderWidth).toBe(0);
    expect(readingMetrics.borderRadius).toBeLessThanOrEqual(2);
    expect(readingMetrics.timeFontSize).toBeLessThanOrEqual(11);
    expect(readingMetrics.fileCardBorderRadius).toBe(12);
    expect(readingMetrics.fileCardMaxWidth).toBe(460);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.screenshot({
      path: 'test-results/subscription-center.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(articleFileCard).toBeVisible();
    expect(await articleFileCard.evaluate((card) => card.scrollWidth > card.clientWidth)).toBe(
      false,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test('lets administrators edit and delete every subscription status from content management', async ({
    page,
  }) => {
    await page.goto('/dm/__dm_subscription__');
    await page.getByRole('button', { name: '管理' }).click();

    await expect(page.getByRole('heading', { name: '内容管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑 SekerChat Desktop 1.0' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除 SekerChat Desktop 1.0' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑 Markdown 新文章' })).toBeVisible();

    await page.getByRole('button', { name: '编辑 SekerChat Desktop 1.0' }).click();
    const editor = page.getByRole('region', { name: '文章编辑器' });
    await expect(editor.getByLabel('标题')).toHaveValue('SekerChat Desktop 1.0');
    await editor.getByRole('button', { name: '← 返回' }).click();

    await page.screenshot({
      path: 'test-results/subscription-management.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    page.once('dialog', (dialog) => dialog.accept());
    const deleteRequest = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        request.url().endsWith('/api/subscriptions/subscription-post-1'),
    );
    await page.getByRole('button', { name: '删除 SekerChat Desktop 1.0' }).click();
    await deleteRequest;
  });

  test('edits rich text and pastes an uploaded image reference with tags disabled', async ({
    page,
  }) => {
    await page.goto('/dm/__dm_subscription__');
    await page.getByRole('button', { name: '发布' }).click();

    const editor = page.getByRole('region', { name: '文章编辑器' });
    await expect(editor.getByText(/单文件最大 5.00 GB/)).toBeVisible();
    const title = editor.getByLabel('标题');
    await title.fill('Markdown 新文章');
    await expect(editor.getByLabel('标签')).toHaveCount(0);
    const actionBar = editor.getByTestId('article-editor-action-bar');
    await expect(actionBar).toHaveCSS('position', 'static');
    const [actionBarBox, titleBox] = await Promise.all([
      actionBar.boundingBox(),
      title.boundingBox(),
    ]);
    expect(actionBarBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(actionBarBox!.y + actionBarBox!.height).toBeLessThanOrEqual(titleBox!.y);

    const body = editor.locator('[contenteditable="true"]');
    await body.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['pngdata'], 'dragged.png', { type: 'image/png' }));
      element.dispatchEvent(
        new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    });
    await expect(editor.getByText('松开即可插入正文图片')).toHaveCount(1);
    await expect(page.getByText('拖拽到消息栏发送附件')).toHaveCount(0);
    await page.screenshot({
      path: 'test-results/subscription-editor-drag-target.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
    await body.evaluate((element) => {
      element.dispatchEvent(
        new DragEvent('dragleave', {
          bubbles: true,
          cancelable: true,
          relatedTarget: document.body,
        }),
      );
    });
    await expect(editor.getByText('松开即可插入正文图片')).toHaveCount(0);
    await body.click();
    await body.type('## 正文标题');
    await body.press('Enter');
    await body.type('这是 Markdown 正文。');

    const stableReferenceRequest = page.waitForRequest((request) => {
      if (
        request.method() !== 'PATCH' ||
        !request.url().endsWith('/api/subscriptions/subscription-draft-1')
      )
        return false;
      const input = request.postDataJSON() as { body?: string };
      return input.body?.includes('attachment://subscription-image-1') ?? false;
    });
    await body.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['pngdata'], 'screenshot.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
      );
    });
    await stableReferenceRequest;
    await expect(editor.locator('img')).toHaveCount(1);
    await expect(editor.getByText('screenshot.png')).toHaveCount(0);
    await page.screenshot({
      path: 'test-results/subscription-editor.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
    await expect(editor.getByRole('heading', { name: '正文标题' })).toBeVisible();
    await expect(editor.getByText(/这是 Markdown 正文/)).toBeVisible();
    await expect(editor.getByText('摘要', { exact: true })).toHaveCount(0);
    await expect(editor.getByText('外部链接', { exact: true })).toHaveCount(0);
  });

  test('captures the manage surface for admin review', async ({ page }) => {
    await page.locator('[data-group-id="group-1"]').dispatchEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180,
    });
    await expect(page.getByRole('menuitem', { name: '打开频道设置' })).toBeVisible();
    await page.getByRole('menuitem', { name: '打开频道设置' }).dispatchEvent('click');

    await expect(page.getByTestId('workspace-surface')).toBeVisible();
    await expect(page.getByTestId('channel-settings-dialog')).toBeVisible();
    await expect(page.getByTestId('rename-group-field')).toBeVisible();
    await expect(page.getByTestId('rename-category-field')).toBeVisible();
    await expect(page.getByText('AI 自治', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('channel-settings-dialog')).toHaveScreenshot(
      'channel-settings-dialog.png',
      {
        animations: 'disabled',
        caret: 'hide',
      },
    );
  });

  test('shows work state controls and no ai config in manage surface', async ({ page }) => {
    await page.locator('[data-group-id="group-1"]').dispatchEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180,
    });
    await expect(page.getByRole('menuitem', { name: '打开频道设置' })).toBeVisible();
    await page.getByRole('menuitem', { name: '打开频道设置' }).dispatchEvent('click');

    const saveButton = page.getByRole('button', { name: '保存频道设置' });

    await expect(page.getByTestId('channel-settings-dialog')).toBeVisible();
    await expect(page.getByTestId('group-work-state-field')).toBeVisible();
    await expect(page.getByTestId('group-work-state-reason-field')).toBeVisible();
    await expect(page.getByText('AI 自治', { exact: true })).toHaveCount(0);
    await expect(saveButton).toBeDisabled();
  });

  test('shows personal activity in user settings', async ({ page }) => {
    await page.getByRole('button', { name: '个人设置' }).click();

    const dialog = page.getByTestId('user-settings-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '修改头像' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: '输入昵称' })).toHaveValue('管理员');
    await expect(dialog.getByText('admin@local.invalid')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '退出登录' })).toBeVisible();
    await expect(dialog.getByText('我的在线时长')).toBeVisible();
    await expect(dialog.getByText('今日在线时长')).toBeVisible();
    await expect(dialog.getByText('1小时50分')).toBeVisible();
    await expect(dialog.getByText('上一日在线时长')).toBeVisible();
    await expect(dialog.getByText('1小时10分')).toBeVisible();
    await expect(dialog.getByText('周平均在线时长')).toBeVisible();
    await expect(dialog.getByText('1小时24分')).toBeVisible();
    await expect(dialog.getByText('月平均在线时长')).toBeVisible();
    await expect(dialog.getByText('1小时04分')).toBeVisible();
    await expect(dialog.getByText('修改昵称或上传头像。')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '关闭' })).toHaveCount(1);
    await expect(dialog.getByText('当前窗口')).toHaveCount(0);
    await expect(dialog.getByText('120 分钟')).toHaveCount(0);
    await expect(dialog.getByText('每日封顶')).toHaveCount(0);
    await expect(dialog.getByText('8小时00分')).toHaveCount(0);
  });

  test('shows an explicit load failure state when groups api fails', async ({ page }) => {
    await installAuthenticatedAppWithOptions(page, {
      groupsResponse: {
        status: 500,
        body: { message: 'Internal server error' },
      },
    });

    await page.goto('/');

    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByText('群组加载失败')).toBeVisible();
    await expect(page.getByText('Internal server error')).toBeVisible();
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByText('从左侧创建一个线程')).toBeHidden();
  });

  test('does not flash a server load failure while current group details are still loading', async ({
    page,
  }) => {
    await installAuthenticatedAppWithOptions(page, {
      groupDetailDelayMs: 1200,
    });

    await page.goto('/groups/group-1');

    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByText('无法加载当前 server。')).toHaveCount(0);
    await expect(page.getByTestId('workspace-surface')).toBeVisible();
    await expect(page.getByText('无法加载当前 server。')).toHaveCount(0);
  });

  test('shows loading skeleton rows before delayed messages resolve', async ({ page }) => {
    await installAuthenticatedAppWithOptions(page, {
      messagesDelayMs: 1200,
      messagesResponse: {
        status: 200,
        body: {
          groupId: 'group-1',
          items: [
            {
              id: 'message-1',
              groupId: 'group-1',
              senderId: 'user-member',
              type: 'text',
              text: '今天 18:00 前确认值班排班。',
              mentionedUserIds: [],
              replyTo: null,
              attachment: null,
              createdAt: '2026-04-03T08:20:00.000Z',
              sender: {
                id: 'user-member',
                email: 'member@local.invalid',
                displayName: '值班同学',
              },
            },
          ],
        },
      },
    });

    await page.goto('/groups/group-1');
    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByTestId('message-skeleton-row')).toHaveCount(5);
    await expect(page.getByTestId('message-card')).toHaveCount(0);
    await expect(page.getByTestId('message-card')).toHaveCount(1);
    await expect(page.getByTestId('message-skeleton-row')).toHaveCount(0);
  });

  test('routes a new user with no server to dm mode and allows starting a dm', async ({ page }) => {
    await installAuthenticatedAppWithOptions(page, {
      currentUserOverride: {
        id: 'user-newcomer',
        email: 'newcomer@local.invalid',
        displayName: '新用户',
        role: 'MEMBER',
      },
      groupsResponse: {
        status: 200,
        body: [],
      },
      dmsResponse: {
        status: 200,
        body: [],
      },
      subscriptionPendingConfirmationCount: 0,
      dmCandidatesResponse: {
        status: 200,
        body: [
          {
            id: 'user-member',
            email: 'member@local.invalid',
            displayName: '值班同学',
          },
        ],
      },
    });

    await page.goto('/');

    await expect(page).toHaveURL(/\/dm\/__dm_attendance__$/);
    await expect(page.getByTestId('dm-attendance-page')).toBeVisible();
    const sidebar = page.getByTestId('groups-sidebar');
    await expect(sidebar.getByText('功能', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('出勤', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('快捷页面', { exact: true })).toHaveCount(0);
    await expect(
      sidebar.getByText('查看签到状态、打卡时长和在线时长的综合分析', { exact: true }),
    ).toHaveCount(0);
    await expect(sidebar).toHaveScreenshot('dm-sidebar.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 20,
    });
    const startDmButton = page.getByRole('button', { name: '新建私聊' });
    await expect(startDmButton).toBeVisible();

    await startDmButton.click();
    await expect(page.getByRole('dialog', { name: '新建私聊' })).toBeVisible();
    await expect(page.getByText('值班同学')).toBeVisible();
  });

  test('renders the clocked timeline and equal-width attendance charts', async ({ page }) => {
    await installAuthenticatedAppWithOptions(page, {
      currentUserOverride: {
        id: 'user-newcomer',
        email: 'newcomer@local.invalid',
        displayName: '新用户',
        role: 'MEMBER',
      },
      groupsResponse: {
        status: 200,
        body: [],
      },
      dmsResponse: {
        status: 200,
        body: [],
      },
      dmCandidatesResponse: {
        status: 200,
        body: [],
      },
    });

    await page.route('**/api/attendance/me/checkin/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workDate: '2026-04-10',
          status: 'CHECKED_OUT',
          checkInAt: '2026-04-10T00:20:00.000Z',
          checkOutAt: '2026-04-10T09:05:00.000Z',
          checkInMinutes: 245,
          onlineMinutes: 315,
        }),
      });
    });
    await page.route('**/api/attendance/me/panel**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            dayWorkedMinutes: 315,
            weekWorkedMinutes: 1440,
            monthWorkedMinutes: 6120,
            monthAverageDailyWorkedMinutes: 204,
          },
          dailySeries: Array.from({ length: 30 }, (_, index) => ({
            workDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
            onlineMinutes: 180 + ((index * 17) % 240),
          })),
          todaySegments: [
            {
              startAt: '2026-04-10T00:20:00.000Z',
              endAt: '2026-04-10T02:40:00.000Z',
              isOnline: true,
              isDnd: false,
            },
            {
              startAt: '2026-04-10T03:10:00.000Z',
              endAt: '2026-04-10T05:15:00.000Z',
              isOnline: true,
              isDnd: true,
            },
          ],
        }),
      });
    });
    await page.route('**/api/attendance/me/checkin/panel**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          today: {
            workDate: '2026-04-10',
            status: 'CHECKED_OUT',
            checkInAt: '2026-04-10T00:20:00.000Z',
            checkOutAt: '2026-04-10T09:05:00.000Z',
            checkInMinutes: 245,
            onlineMinutes: 315,
          },
          checkInSeries: Array.from({ length: 30 }, (_, index) => ({
            workDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
            checkInMinutes: 150 + ((index * 13) % 240),
          })),
          statusSeries: Array.from({ length: 30 }, (_, index) => ({
            workDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
            status: 'CHECKED_OUT',
            checkInAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:15:00.000Z`,
            checkOutAt: `2026-03-${String(index + 1).padStart(2, '0')}T09:05:00.000Z`,
          })),
          recentRecords: Array.from({ length: 7 }, (_, index) => ({
            workDate: `2026-04-${String(index + 1).padStart(2, '0')}`,
            status: 'CHECKED_OUT',
            checkInAt: `2026-04-${String(index + 1).padStart(2, '0')}T00:15:00.000Z`,
            checkOutAt: `2026-04-${String(index + 1).padStart(2, '0')}T09:05:00.000Z`,
          })),
          summary: {
            checkedInDays: 18,
            consecutiveCheckInDays: 4,
            averages: {
              online: {
                monthAverageMinutes: 204,
                totalAverageMinutes: 198,
              },
              checkIn: {
                monthAverageMinutes: 186,
                totalAverageMinutes: 179,
              },
            },
          },
        }),
      });
    });

    await page.goto('/dm/__dm_attendance__');
    await expect(page).toHaveURL(/\/dm\/__dm_attendance__$/);
    await expect(page.getByText('出勤摘要')).toHaveCount(0);
    await expect(page.getByTestId('open-info-sidebar-button')).toHaveCount(0);
    const attendanceGridColumns = await page
      .getByTestId('groups-workspace')
      .evaluate((workspace) => getComputedStyle(workspace).gridTemplateColumns.split(' ').length);
    expect(attendanceGridColumns).toBe(3);
    const timelineTrack = page.getByTestId('today-online-timeline-track');
    const timelineConnector = page.getByTestId('timeline-checkin-checkout-connection');
    const checkInBubble = page.getByTestId('timeline-checkin-marker').getByText('签到');
    const checkOutBubble = page.getByTestId('timeline-checkout-marker').getByText('签退');
    await expect(timelineConnector).toBeVisible();
    await expect(checkInBubble).toBeVisible();
    await expect(checkOutBubble).toBeVisible();

    const timelineGeometry = await timelineTrack.evaluate((track) => {
      const connector = track.querySelector(
        '[data-testid="timeline-checkin-checkout-connection"]',
      ) as HTMLElement;
      const checkInLabel = track.querySelector(
        '[data-testid="timeline-checkin-marker"] span',
      ) as HTMLElement;
      const checkOutLabel = track.querySelector(
        '[data-testid="timeline-checkout-marker"] span',
      ) as HTMLElement;
      const trackRect = track.getBoundingClientRect();

      return {
        connectorWidth: connector.getBoundingClientRect().width,
        checkInBubbleBottom: checkInLabel.getBoundingClientRect().bottom,
        checkOutBubbleBottom: checkOutLabel.getBoundingClientRect().bottom,
        trackTop: trackRect.top,
      };
    });
    expect(timelineGeometry.connectorWidth).toBeGreaterThan(0);
    expect(timelineGeometry.checkInBubbleBottom).toBeLessThanOrEqual(timelineGeometry.trackTop);
    expect(timelineGeometry.checkOutBubbleBottom).toBeLessThanOrEqual(timelineGeometry.trackTop);
    await page.screenshot({
      path: 'test-results/attendance-page.png',
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    await expect(page.getByRole('heading', { name: '打卡/在线时长趋势' })).toHaveCount(0);
    const secondaryCharts = page.getByTestId('attendance-secondary-charts');
    await expect(secondaryCharts).toBeVisible();
    const distributionViewport = page.getByTestId('time-distribution-viewport');
    const heatmapViewport = page.getByRole('img', { name: '出勤在线强度热力矩阵' }).locator('..');

    for (const width of [1080, 960]) {
      await page.setViewportSize({ width, height: 960 });
      const metrics = await secondaryCharts.evaluate((node) => {
        const [heatmapCard, distributionCard] = Array.from(node.children) as HTMLElement[];
        const heatmapRect = heatmapCard.getBoundingClientRect();
        const distributionRect = distributionCard.getBoundingClientRect();

        return {
          columnCount: getComputedStyle(node).gridTemplateColumns.split(' ').length,
          heatmapWidth: heatmapRect.width,
          distributionWidth: distributionRect.width,
          heatmapTop: heatmapRect.top,
          distributionTop: distributionRect.top,
        };
      });

      expect(metrics.columnCount).toBe(2);
      expect(Math.abs(metrics.heatmapWidth - metrics.distributionWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.heatmapTop - metrics.distributionTop)).toBeLessThanOrEqual(1);
      await expect(distributionViewport).toHaveCSS('height', '260px');

      const [distributionHeight, heatmapHeight] = await Promise.all([
        distributionViewport.evaluate((node) => node.getBoundingClientRect().height),
        heatmapViewport.evaluate((node) => node.getBoundingClientRect().height),
      ]);
      expect(Math.abs(distributionHeight - heatmapHeight)).toBeLessThanOrEqual(20);
    }

    await page.setViewportSize({ width: 840, height: 960 });
    const mobileColumnCount = await secondaryCharts.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length,
    );
    expect(mobileColumnCount).toBe(1);
  });
});
