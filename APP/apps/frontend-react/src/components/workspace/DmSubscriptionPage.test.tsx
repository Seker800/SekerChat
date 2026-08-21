import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmSubscriptionPage } from './DmSubscriptionPage';

const listSubscriptionPosts = vi.fn();
const getSubscriptionPost = vi.fn();
const listManageableSubscriptionPosts = vi.fn();
const confirmSubscriptionPost = vi.fn();
const getSubscriptionConfirmations = vi.fn();
const createSubscriptionDraft = vi.fn();
const updateSubscriptionPost = vi.fn();
const publishSubscriptionPost = vi.fn();
const uploadFileViaMultipart = vi.fn();
const getSubscriptionAttachmentViewUrl = vi.fn();
const downloadFile = vi.fn();

vi.mock('../../lib/api-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-core')>()),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));

vi.mock('../../lib/multipart-upload', () => ({
  uploadFileViaMultipart: (...args: unknown[]) => uploadFileViaMultipart(...args),
}));

vi.mock('../../lib/subscriptions-api', () => ({
  listSubscriptionPosts: (...args: unknown[]) => listSubscriptionPosts(...args),
  getSubscriptionPost: (...args: unknown[]) => getSubscriptionPost(...args),
  listManageableSubscriptionPosts: (...args: unknown[]) => listManageableSubscriptionPosts(...args),
  confirmSubscriptionPost: (...args: unknown[]) => confirmSubscriptionPost(...args),
  getSubscriptionConfirmations: (...args: unknown[]) => getSubscriptionConfirmations(...args),
  createSubscriptionDraft: (...args: unknown[]) => createSubscriptionDraft(...args),
  updateSubscriptionPost: (...args: unknown[]) => updateSubscriptionPost(...args),
  publishSubscriptionPost: (...args: unknown[]) => publishSubscriptionPost(...args),
  setSubscriptionPostPinned: vi.fn(),
  withdrawSubscriptionPost: vi.fn(),
  deleteSubscriptionPost: vi.fn(),
  subscriptionAttachmentContentUrl: (id: string) => `/api/subscriptions/attachments/${id}/content`,
  getSubscriptionAttachmentViewUrl: (...args: unknown[]) =>
    getSubscriptionAttachmentViewUrl(...args),
}));

const summary = {
  id: 'post-1',
  status: 'PUBLISHED',
  title: 'SekerChat Desktop 1.0',
  bodyPreview: '新的桌面版本，点击查看完整更新说明。',
  tags: ['desktop'],
  isPinned: true,
  isConfirmed: false,
  isRecipient: true,
  confirmedAt: null,
  confirmationProgress: null,
  publishedAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  author: { id: 'manager-1', displayName: 'Manager', email: 'manager@example.com' },
  attachmentCount: 1,
  hasAttachments: true,
};

const detail = {
  ...summary,
  body: '## 完整更新\n\n- 支持 Markdown\n- 修复若干问题',
  attachments: [
    {
      id: 'attachment-1',
      originalName: 'sekerchat.zip',
      mimeType: 'application/zip',
      size: 1024,
      sha256: 'abc',
      downloadCount: 0,
      usage: 'DOWNLOADABLE_FILE',
    },
    {
      id: 'inline-image-1',
      originalName: 'article-image.png',
      mimeType: 'image/png',
      size: 512,
      sha256: 'def',
      downloadCount: 0,
      usage: 'INLINE_IMAGE',
    },
  ],
};

function renderPage(canManage = false, strictMode = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const page = (
    <QueryClientProvider client={queryClient}>
      <DmSubscriptionPage accessToken="token" canManage={canManage} />
    </QueryClientProvider>
  );
  return render(strictMode ? <StrictMode>{page}</StrictMode> : page);
}

describe('DmSubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSubscriptionPosts.mockResolvedValue({ items: [summary], pendingConfirmationCount: 1 });
    getSubscriptionPost.mockResolvedValue(detail);
    listManageableSubscriptionPosts.mockResolvedValue({ items: [] });
    confirmSubscriptionPost.mockResolvedValue({
      isConfirmed: true,
      confirmedAt: '2026-07-25T01:00:00.000Z',
      pendingConfirmationCount: 0,
    });
    getSubscriptionConfirmations.mockResolvedValue({
      postId: summary.id,
      confirmedCount: 0,
      recipientCount: 1,
      confirmed: [],
      pending: [{ userId: 'reader-1', displayName: 'Reader', email: 'reader@example.com' }],
    });
    getSubscriptionAttachmentViewUrl.mockResolvedValue({
      url: 'https://objects.example/article-image.png',
      originalName: 'article-image.png',
      mimeType: 'image/png',
      size: 512,
    });
    const draft = {
      ...detail,
      id: 'draft-new',
      status: 'DRAFT',
      title: '',
      body: '',
      attachments: [],
    };
    createSubscriptionDraft.mockResolvedValue(draft);
    updateSubscriptionPost.mockImplementation(
      async (_accessToken: string, _postId: string, input: typeof draft) => ({
        ...draft,
        ...input,
      }),
    );
    publishSubscriptionPost.mockResolvedValue({ ...draft, status: 'PUBLISHED' });
    uploadFileViaMultipart.mockResolvedValue({
      finalized: {
        kind: 'SUBSCRIPTION_ATTACHMENT',
        attachment: {
          id: 'attachment-new',
          originalName: 'image.png',
          mimeType: 'image/png',
          size: 3,
          sha256: 'abc',
          downloadCount: 0,
          usage: 'INLINE_IMAGE',
        },
      },
    });
  });

  it('shows a compact preview and loads the full markdown body only after opening details', async () => {
    renderPage();

    expect(await screen.findByText('SekerChat Desktop 1.0')).toBeInTheDocument();
    expect(screen.getByText('新的桌面版本，点击查看完整更新说明。')).toBeInTheDocument();
    expect(screen.queryByText('完整更新')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下载 sekerchat.zip/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /打开.*文章 SekerChat Desktop 1.0/ }));

    expect(await screen.findByRole('heading', { name: '完整更新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下载 sekerchat.zip/ })).toBeInTheDocument();
    expect(getSubscriptionPost).toHaveBeenCalledWith('token', 'post-1');
    expect(screen.getByRole('button', { name: '返回文章列表' })).toBeInTheDocument();
  });

  it('shows the article list directly without a filter toolbar', async () => {
    renderPage();
    await screen.findByText('SekerChat Desktop 1.0');

    expect(screen.queryByRole('button', { name: '全部' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '未读' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '全部已读' })).not.toBeInTheDocument();
  });

  it('keeps unconfirmed content above confirmed content without a list confirmation control', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({
      items: [
        {
          ...summary,
          id: 'confirmed-1',
          title: '历史文章',
          isConfirmed: true,
          confirmedAt: '2026-07-25T01:00:00.000Z',
        },
        summary,
      ],
      pendingConfirmationCount: 1,
    });
    renderPage();

    const cards = await screen.findAllByTestId(/^subscription-card-(?!title-row-)/);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      summary.title,
      '历史文章',
    ]);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(cards[0]).getByText('未确认')).toBeInTheDocument();
    expect(within(cards[0]).getByText(summary.bodyPreview)).toBeInTheDocument();
    expect(within(cards[1]).queryByText(/已读|已确认/)).not.toBeInTheDocument();
    expect(within(cards[1]).getByText(summary.bodyPreview)).toBeInTheDocument();

    const stylesheet = readFileSync(
      join(process.cwd(), 'src/components/workspace/DmSubscriptionPage.module.css'),
      'utf8',
    );
    expect(stylesheet).not.toMatch(/\.cardConfirmed\s*\{[^}]*opacity:/s);
  });

  it('does not confirm an article merely because its detail was opened', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /打开.*SekerChat Desktop 1.0/ }));
    await screen.findByRole('heading', { name: '完整更新' });

    expect(confirmSubscriptionPost).not.toHaveBeenCalled();
  });

  it('confirms an article only from the end of its detail view', async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: /打开未确认文章 SekerChat Desktop 1.0/ }),
    );
    const confirmButton = await screen.findByRole('button', { name: '确认已读' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(confirmSubscriptionPost).toHaveBeenCalledWith('token', 'post-1'));
    expect(await screen.findByText(/已于.*确认已读/)).toBeInTheDocument();
  });

  it('lets managers open the confirmation progress without opening the article', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({
      items: [
        {
          ...summary,
          isRecipient: false,
          confirmationProgress: { confirmedCount: 1, recipientCount: 6 },
        },
      ],
      pendingConfirmationCount: 0,
    });
    renderPage(true);

    fireEvent.click(await screen.findByRole('button', { name: '1/6 已确认已读，查看名单' }));

    expect(await screen.findByRole('dialog', { name: '确认已读名单' })).toBeInTheDocument();
    expect(getSubscriptionConfirmations).toHaveBeenCalledWith('token', 'post-1');
    expect(getSubscriptionPost).not.toHaveBeenCalled();
  });

  it('renders details as a quiet reading view without list metadata badges', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /打开.*SekerChat Desktop 1.0/ }));
    const readingView = await screen.findByTestId('subscription-reading-view');

    expect(within(readingView).queryByText('#desktop')).not.toBeInTheDocument();
    expect(within(readingView).queryByText('待确认')).not.toBeInTheDocument();
    expect(within(readingView).queryByText('已确认')).not.toBeInTheDocument();
    expect(within(readingView).queryByText('置顶')).not.toBeInTheDocument();
    expect(
      within(readingView).getByRole('button', { name: '下载 sekerchat.zip' }),
    ).toBeInTheDocument();
  });

  it('downloads an article attachment with its filename and the active access token', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /打开.*SekerChat Desktop 1.0/ }));
    const attachmentCard = await screen.findByTestId('file-attachment-card');
    expect(within(attachmentCard).getByText('sekerchat.zip')).toBeInTheDocument();
    expect(within(attachmentCard).getByText('1.0 KB')).toBeInTheDocument();
    expect(within(attachmentCard).queryByRole('button', { name: /分享/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '下载 sekerchat.zip' }));

    expect(downloadFile).toHaveBeenCalledWith(
      '/api/subscriptions/attachments/attachment-1/content',
      'sekerchat.zip',
      'token',
    );
  });

  it('places each card title and publish time together in the first row', async () => {
    renderPage();

    const titleRow = await screen.findByTestId('subscription-card-title-row-post-1');
    expect(within(titleRow).getByRole('heading', { name: summary.title })).toBeInTheDocument();
    expect(titleRow.querySelector('time')).toBeInTheDocument();
  });

  it('renders a quiet reading row without tags, detail prompts, or checkbox controls', async () => {
    renderPage();

    const row = await screen.findByTestId('subscription-card-post-1');
    expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row).queryByText('#桌面端')).not.toBeInTheDocument();
    expect(within(row).queryByText('#更新')).not.toBeInTheDocument();
    expect(within(row).queryByText('阅读详情')).not.toBeInTheDocument();
    expect(within(row).getByText('1 个附件')).toBeInTheDocument();
  });

  it('lets managers edit and delete published, draft, and withdrawn content', async () => {
    listManageableSubscriptionPosts.mockResolvedValueOnce({
      items: [
        detail,
        { ...detail, id: 'draft-1', title: '待发布草稿', status: 'DRAFT' },
        { ...detail, id: 'withdrawn-1', title: '已撤回内容', status: 'WITHDRAWN' },
      ],
    });
    renderPage(true);

    fireEvent.click(await screen.findByRole('button', { name: '管理' }));

    expect(await screen.findByText('SekerChat Desktop 1.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑 SekerChat Desktop 1.0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除 SekerChat Desktop 1.0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑 待发布草稿' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除 已撤回内容' })).toBeInTheDocument();
  });

  it('shows a WYSIWYG article editor with direct image paste support', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({ items: [], pendingConfirmationCount: 0 });
    renderPage(true);

    fireEvent.click(await screen.findByRole('button', { name: '发布' }));

    expect(screen.getByRole('heading', { name: '新建文章' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveAttribute('placeholder', '输入文章标题');
    expect(screen.queryByLabelText('标签')).not.toBeInTheDocument();
    expect(await screen.findByTestId('subscription-article-editor')).toHaveAttribute(
      'data-editor-engine',
      'crepe',
    );
    expect(screen.getByRole('region', { name: '发布设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择下载附件' })).toBeInTheDocument();
    expect(
      screen.getByText('正文图片请粘贴或拖入左侧正文；这里选择的文件会作为下载附件。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布文章' })).toBeInTheDocument();
    const actionBar = screen.getByTestId('article-editor-action-bar');
    expect(getComputedStyle(actionBar).position).not.toBe('sticky');
    expect(screen.queryByLabelText('Markdown 正文')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('摘要')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('内容类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('外部链接')).not.toBeInTheDocument();
  });

  it('accepts download attachments only in the download attachment control', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({ items: [], pendingConfirmationCount: 0 });
    renderPage(true);
    fireEvent.click(await screen.findByRole('button', { name: '发布' }));
    const dropControl = screen.getByRole('button', { name: '选择下载附件' });
    const attachment = new File(['release notes'], 'release-notes.pdf', {
      type: 'application/pdf',
    });
    const dataTransfer = {
      types: ['Files'],
      files: [attachment],
      dropEffect: 'none',
    };

    fireEvent.dragEnter(dropControl, { dataTransfer });
    expect(
      screen.getByRole('button', { name: '松开添加为下载附件' }),
    ).toBeInTheDocument();

    fireEvent.drop(screen.getByRole('button', { name: '松开添加为下载附件' }), {
      dataTransfer,
    });

    expect(screen.getByText('release-notes.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择下载附件' })).toBeInTheDocument();
  });

  it('creates an untitled draft before uploading a pasted image and autosaves its stable URL', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({ items: [], pendingConfirmationCount: 0 });
    renderPage(true, true);
    fireEvent.click(await screen.findByRole('button', { name: '发布' }));
    const editorRoot = await screen.findByTestId('subscription-article-editor');
    let textbox: HTMLElement | null = null;
    await waitFor(() => {
      textbox = editorRoot.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(textbox).not.toBeNull();
    });
    const image = new File(['png'], 'image.png', { type: 'image/png' });
    const clipboardFiles = {
      0: image,
      length: 1,
      item: (index: number) => (index === 0 ? image : null),
    };
    class TestClipboardEvent extends Event {}
    class TestDragEvent extends Event {}
    vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
    vi.stubGlobal('DragEvent', TestDragEvent);
    const event = new TestClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: clipboardFiles, getData: () => '' },
    });

    fireEvent(textbox!, event);

    await waitFor(() =>
      expect(createSubscriptionDraft).toHaveBeenCalledWith('token', {
        title: '',
        body: '',
        tags: [],
      }),
    );
    await waitFor(() =>
      expect(uploadFileViaMultipart).toHaveBeenCalledWith(
        'token',
        'SUBSCRIPTION_ATTACHMENT',
        'draft-new',
        expect.any(File),
        expect.any(Function),
        undefined,
        { subscriptionUsage: 'INLINE_IMAGE' },
      ),
    );
    await waitFor(
      () => {
        expect(updateSubscriptionPost).toHaveBeenCalledWith(
          'token',
          'draft-new',
          expect.objectContaining({ body: expect.stringContaining('attachment://attachment-new') }),
        );
      },
      { timeout: 2_000 },
    );
  });

  it('keeps inline images in the article body and out of the download attachment section', async () => {
    getSubscriptionPost.mockResolvedValueOnce({
      ...detail,
      body: '正文图片：\n\n![界面截图](attachment://inline-image-1)',
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', {
      name: `打开未确认文章 ${summary.title}`,
    }));

    expect(await screen.findByRole('img', { name: '界面截图' })).toHaveAttribute(
      'src',
      'https://objects.example/article-image.png',
    );
    const attachmentSection = screen.getByRole('heading', { name: '附件' }).closest('section');
    expect(attachmentSection).not.toBeNull();
    expect(within(attachmentSection!).getByText('sekerchat.zip')).toBeInTheDocument();
    expect(within(attachmentSection!).queryByText('article-image.png')).not.toBeInTheDocument();
  });

  it('shows load errors with a retry action', async () => {
    listSubscriptionPosts.mockRejectedValueOnce(new Error('文章服务不可用'));
    renderPage();

    expect(await screen.findByText('文章服务不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('shows publishing entry only to authorized managers', async () => {
    listSubscriptionPosts.mockResolvedValueOnce({ items: [], pendingConfirmationCount: 0 });
    const { unmount } = renderPage(true);

    await waitFor(() => expect(screen.getByRole('button', { name: '发布' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '管理' })).toBeInTheDocument();

    unmount();
    renderPage(false);
    expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '管理' })).not.toBeInTheDocument();
  });
});
