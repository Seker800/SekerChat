import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageResponse } from '../../lib/messages-files-api';
import { MessagePane } from './MessagePane';
import { clearPrivateMediaCache } from './media/privateMediaRepository';

const fetchMock = vi.fn();
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalNaturalWidth = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  'naturalWidth',
);
const originalNaturalHeight = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  'naturalHeight',
);
const originalSetPointerCapture = HTMLButtonElement.prototype.setPointerCapture;
const originalReleasePointerCapture = HTMLButtonElement.prototype.releasePointerCapture;
const originalHasPointerCapture = HTMLButtonElement.prototype.hasPointerCapture;

const imageMessage: MessageResponse = {
  id: 'message-1',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'image',
  text: null,
  mentionedUserIds: [],
  replyTo: null,
  attachment: {
    id: 'attachment-1',
    fileId: 'file-1',
    groupId: 'group-1',
    originalName: 'evidence.png',
    mimeType: 'image/png',
    size: 1024,
    createdAt: '2026-04-28T08:00:00.000Z',
    contentUrl: 'http://backend.test/files/evidence.png',
    metadataUrl: 'http://backend.test/files/evidence.json',
    uploaderId: 'user-1',
    kind: 'image',
    thumbnailUrl: null,
  },
  readReceipt: {
    totalRecipients: 1,
    readCount: 0,
    unreadCount: 1,
    readBy: [],
    unreadBy: [
      {
        userId: 'user-2',
        email: 'reader@example.com',
        displayName: 'Reader',
        avatarUrl: null,
      },
    ],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:00:00.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: '值班员',
    avatarUrl: null,
  },
};

const secondImageMessage: MessageResponse = {
  ...imageMessage,
  id: 'message-image-2',
  attachment: {
    ...imageMessage.attachment!,
    id: 'attachment-image-2',
    fileId: 'file-image-2',
    originalName: 'second-evidence.png',
    contentUrl: 'http://backend.test/files/evidence.png',
  },
};

const smallImageMessage: MessageResponse = {
  ...imageMessage,
  id: 'message-image-small',
  attachment: {
    ...imageMessage.attachment!,
    id: 'attachment-image-small',
    fileId: 'file-image-small',
    originalName: 'small-evidence.png',
    contentUrl: 'http://backend.test/files/small-evidence.png',
  },
};

const systemMessage: MessageResponse = {
  id: 'system-1',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'system',
  text: '23123 创建了频道',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: {
    totalRecipients: 0,
    readCount: 0,
    unreadCount: 0,
    readBy: [],
    unreadBy: [],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:00:00.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: '23123',
    avatarUrl: null,
  },
};

const textMessageAfterSystem: MessageResponse = {
  id: 'message-2',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'text',
  text: '大家好',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: {
    totalRecipients: 1,
    readCount: 0,
    unreadCount: 1,
    readBy: [],
    unreadBy: [
      {
        userId: 'user-2',
        email: 'reader@example.com',
        displayName: 'Reader',
        avatarUrl: null,
      },
    ],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:01:00.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: '23123',
    avatarUrl: null,
  },
};

const htmlInjectionMessage: MessageResponse = {
  id: 'message-html',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'text',
  text: '<img src=x onerror=alert(1)> **safe**',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: {
    totalRecipients: 1,
    readCount: 0,
    unreadCount: 1,
    readBy: [],
    unreadBy: [
      {
        userId: 'user-2',
        email: 'reader@example.com',
        displayName: 'Reader',
        avatarUrl: null,
      },
    ],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:02:00.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: '值班员',
    avatarUrl: null,
  },
};

const markdownLongLineMessage: MessageResponse = {
  id: 'message-markdown-long-line',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'text',
  text: '`averyveryveryveryveryveryveryveryveryveryverylongtokenwithoutspaces`',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: {
    totalRecipients: 1,
    readCount: 0,
    unreadCount: 1,
    readBy: [],
    unreadBy: [
      {
        userId: 'user-2',
        email: 'reader@example.com',
        displayName: 'Reader',
        avatarUrl: null,
      },
    ],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:02:30.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: '值班员',
    avatarUrl: null,
  },
};

const selfMentionMessage: MessageResponse = {
  id: 'message-self-mention',
  groupId: 'group-1',
  senderId: 'user-2',
  type: 'text',
  text: '请 @值班员 跟进，后续由 @Reader 协助。',
  mentionedUserIds: ['user-1'],
  replyTo: null,
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:02:45.000Z',
  sender: {
    id: 'user-2',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  },
};

const mentionInsideCodeMessage: MessageResponse = {
  id: 'message-mention-inline-code',
  groupId: 'group-1',
  senderId: 'user-2',
  type: 'text',
  text: '先看 `@值班员` 这段示例，再实际联系 @值班员 处理。',
  mentionedUserIds: ['user-1'],
  replyTo: null,
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:02:50.000Z',
  sender: {
    id: 'user-2',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  },
};

const copyTargetMessage: MessageResponse = {
  id: 'message-copy',
  groupId: 'group-1',
  senderId: 'user-2',
  type: 'text',
  text: '可复制的消息内容',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: {
    totalRecipients: 1,
    readCount: 1,
    unreadCount: 0,
    readBy: [
      {
        userId: 'user-1',
        email: 'user@example.com',
        displayName: '值班员',
        avatarUrl: null,
      },
    ],
    unreadBy: [],
  },
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:03:00.000Z',
  sender: {
    id: 'user-2',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  },
};

const fileMessage: MessageResponse = {
  id: 'message-file',
  groupId: 'group-1',
  senderId: 'user-2',
  type: 'file',
  text: null,
  mentionedUserIds: [],
  replyTo: null,
  attachment: {
    id: 'attachment-file-1',
    fileId: 'file-attachment-1',
    groupId: 'group-1',
    originalName: 'release.zip',
    mimeType: 'application/zip',
    size: 4096,
    createdAt: '2026-04-28T08:10:00.000Z',
    contentUrl: 'http://localhost:3000/api/groups/group-1/files/file-attachment-1/content',
    metadataUrl: 'http://backend.test/files/release.json',
    uploaderId: 'user-2',
    kind: 'file',
    thumbnailUrl: null,
  },
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:10:00.000Z',
  sender: {
    id: 'user-2',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  },
};

describe('MessagePane packaging artifact actions', () => {
  it('shows add-to-artifacts beside image and file attachments only while packaging', () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[imageMessage, fileMessage]}
        currentUserId="user-1"
        artifactAction={{
          isEnabled: true,
          isLocked: false,
          addedFileIds: new Set(),
          pendingFileIds: new Set(),
          onAdd,
        }}
        onReply={() => undefined}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: '添加到产出' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(onAdd).toHaveBeenCalledWith('file-1');

    rerender(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[imageMessage, fileMessage]}
        currentUserId="user-1"
        artifactAction={{
          isEnabled: false,
          isLocked: false,
          addedFileIds: new Set(),
          pendingFileIds: new Set(),
          onAdd,
        }}
        onReply={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '添加到产出' })).not.toBeInTheDocument();
  });

  it('marks attachments already added to artifacts and prevents duplicate actions', () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[imageMessage]}
        currentUserId="user-1"
        artifactAction={{
          isEnabled: true,
          isLocked: false,
          addedFileIds: new Set(['file-1']),
          pendingFileIds: new Set(),
          onAdd: vi.fn(),
        }}
        onReply={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '已添加到产出' })).toBeDisabled();
  });
});

const replyMessage: MessageResponse = {
  id: 'message-reply',
  groupId: 'group-1',
  senderId: 'user-2',
  type: 'text',
  text: '这是带回复的消息',
  mentionedUserIds: [],
  replyTo: {
    id: 'message-origin',
    senderId: 'user-1',
    type: 'text',
    textPreview: '原始消息预览',
    sender: {
      id: 'user-1',
      email: 'user@example.com',
      displayName: '值班员',
      avatarUrl: null,
    },
    attachment: null,
  },
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-04-28T08:11:00.000Z',
  sender: {
    id: 'user-2',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  },
};

function mockJsonResponse(data: unknown) {
  const body = JSON.stringify(data);
  return {
    ok: true,
    text: async () => body,
    json: async () => data,
    blob: async () => new Blob([body]),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

function mockBlobResponse(contentType = 'image/png') {
  return {
    ok: true,
    text: async () => '',
    blob: async () => new Blob(['preview'], { type: contentType }),
    headers: new Headers({ 'content-type': contentType }),
  };
}

describe('MessagePane image preview', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(mockBlobResponse());
    createObjectUrlMock.mockReturnValue('blob:preview-image');

    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 2400,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 1600,
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'hasPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRectMock(this: HTMLElement) {
        if (this.getAttribute?.('data-testid') === 'image-preview-stage') {
          return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 1200,
            bottom: 700,
            width: 1200,
            height: 700,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
  });

  afterEach(() => {
    cleanup();
    clearPrivateMediaCache();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
    if (originalNaturalWidth) {
      Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', originalNaturalWidth);
    }
    if (originalNaturalHeight) {
      Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', originalNaturalHeight);
    }
    Object.defineProperty(HTMLButtonElement.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: originalSetPointerCapture,
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: originalReleasePointerCapture,
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'hasPointerCapture', {
      configurable: true,
      writable: true,
      value: originalHasPointerCapture,
    });
  });

  it('opens oversized previews fully visible, allows wheel zoom, then supports drag, and closes on the backdrop', async () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[imageMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const previewTrigger = await screen.findByRole('button', { name: '全屏查看 evidence.png' });
    fireEvent.click(previewTrigger);

    expect(await screen.findByRole('dialog', { name: 'evidence.png' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    const previewImage = await screen.findByTestId('image-preview-image');
    fireEvent.load(previewImage);

    const previewToggle = await screen.findByTestId('image-preview-toggle');
    await waitFor(() => {
      expect(previewToggle).toHaveAccessibleName('evidence.png');
      expect(previewToggle).toHaveAttribute('data-preview-can-pan', 'true');
    });

    fireEvent.click(previewToggle);

    await waitFor(() => {
      expect(previewToggle).toHaveAccessibleName('evidence.png');
      expect(previewToggle).toHaveAttribute('data-preview-can-pan', 'true');
    });

    fireEvent.pointerDown(previewToggle, { pointerId: 1, clientX: 600, clientY: 350 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 540, clientY: 290 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 540, clientY: 290 });

    await waitFor(() => {
      expect(previewToggle.getAttribute('style')).not.toBeNull();
    });

    const offsetBeforeDrag = previewToggle.getAttribute('data-preview-offset');

    fireEvent.pointerDown(previewToggle, { pointerId: 1, clientX: 400, clientY: 280 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 470, clientY: 340 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 470, clientY: 340 });

    await waitFor(() => {
      expect(previewToggle.getAttribute('data-preview-offset')).not.toBe(offsetBeforeDrag);
    });

    const offsetBeforeWheel = previewToggle.getAttribute('data-preview-offset');
    fireEvent.wheel(screen.getByTestId('image-preview-stage'), {
      deltaY: -120,
      clientX: 400,
      clientY: 280,
    });

    await waitFor(() => {
      expect(previewToggle.getAttribute('data-preview-offset')).not.toBe(offsetBeforeWheel);
    });

    fireEvent.click(screen.getByTestId('image-preview-backdrop'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'evidence.png' })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('restarts another oversized image from full-view zoom state after closing the previous preview', async () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[imageMessage, secondImageMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const firstPreviewTrigger = await screen.findByRole('button', {
      name: '全屏查看 evidence.png',
    });
    fireEvent.click(firstPreviewTrigger);

    const firstPreviewImage = await screen.findByTestId('image-preview-image');
    fireEvent.load(firstPreviewImage);

    await waitFor(() => {
      expect(screen.getByTestId('image-preview-toggle')).toHaveAttribute(
        'data-preview-can-pan',
        'true',
      );
    });

    fireEvent.click(screen.getByTestId('image-preview-backdrop'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'evidence.png' })).not.toBeInTheDocument();
    });

    const secondPreviewTrigger = await screen.findByRole('button', {
      name: '全屏查看 second-evidence.png',
    });
    fireEvent.click(secondPreviewTrigger);

    const secondPreviewImage = await screen.findByTestId('image-preview-image');
    fireEvent.load(secondPreviewImage);

    await waitFor(() => {
      expect(screen.getByTestId('image-preview-toggle')).toHaveAccessibleName(
        'second-evidence.png',
      );
      expect(screen.getByTestId('image-preview-toggle')).toHaveAttribute(
        'data-preview-can-pan',
        'true',
      );
    });
  });

  it('allows wheel zoom for small images as well', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 240,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 180,
    });

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[smallImageMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const previewTrigger = await screen.findByRole('button', {
      name: '全屏查看 small-evidence.png',
    });
    fireEvent.click(previewTrigger);

    const previewImage = await screen.findByTestId('image-preview-image');
    fireEvent.load(previewImage);

    const previewToggle = await screen.findByTestId('image-preview-toggle');
    await waitFor(() => {
      expect(previewToggle).toHaveAttribute('data-preview-can-pan', 'true');
      expect(previewToggle.getAttribute('style')).toContain('translate(0px, 0px)');
    });

    const offsetBeforeDrag = previewToggle.getAttribute('data-preview-offset');
    fireEvent.pointerDown(previewToggle, { pointerId: 1, clientX: 400, clientY: 280 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 300 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 430, clientY: 300 });

    await waitFor(() => {
      expect(previewToggle.getAttribute('data-preview-offset')).not.toBe(offsetBeforeDrag);
    });

    const offsetBeforeWheel = previewToggle.getAttribute('data-preview-offset');
    fireEvent.wheel(screen.getByTestId('image-preview-stage'), {
      deltaY: -120,
      clientX: 400,
      clientY: 280,
    });

    await waitFor(() => {
      expect(previewToggle.getAttribute('data-preview-offset')).not.toBe(offsetBeforeWheel);
    });

    expect(previewImage).toHaveStyle({ width: '300px', height: '225px' });
  });

  it('falls back to the original image when the thumbnail request fails', async () => {
    // Thumbnail view-url fails, falls back to original contentUrl via view-url
    fetchMock
      .mockResolvedValueOnce({ ok: false, text: async () => '', headers: new Headers() })
      .mockResolvedValue(
        mockJsonResponse({ url: 'https://media.example.test/bucket/evidence.png' }),
      );

    const thumbnailMessage: MessageResponse = {
      ...imageMessage,
      attachment: {
        ...imageMessage.attachment!,
        contentUrl: 'http://localhost:3000/api/groups/group-1/files/original/content',
        thumbnailUrl: 'http://localhost:3000/api/groups/group-1/files/thumb/content',
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[thumbnailMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    // Falls back to original image via view-url
    expect(await screen.findByAltText('evidence.png')).toHaveAttribute(
      'src',
      'https://media.example.test/bucket/evidence.png',
    );
  });

  it('shows an explicit error state when both thumbnail and original fail', async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => '', headers: new Headers() });
    const failingMessage: MessageResponse = {
      ...imageMessage,
      attachment: {
        ...imageMessage.attachment!,
        contentUrl: 'http://localhost:3000/api/groups/group-1/files/thumb/content',
        thumbnailUrl: 'http://localhost:3000/api/groups/group-1/files/thumb/content',
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[failingMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('image-attachment-placeholder')).toHaveTextContent('图片加载失败');
    });
  });

  it('keeps original preview access when inline image loading fails', async () => {
    // Thumbnail view-url fails, but preview click succeeds
    fetchMock.mockResolvedValue(
      mockJsonResponse({ url: 'https://media.example.test/bucket/evidence.png' }),
    );
    const failingMessage: MessageResponse = {
      ...imageMessage,
      attachment: {
        ...imageMessage.attachment!,
        contentUrl: 'http://localhost:3000/api/groups/group-1/files/original/content',
        thumbnailUrl: 'http://localhost:3000/api/groups/group-1/files/original/content',
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[failingMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const card = await screen.findByTestId('message-card');
    const trigger = within(card).getByRole('button', { name: '全屏查看 evidence.png' });
    expect(trigger).toBeEnabled();

    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'evidence.png' })).toBeInTheDocument();
    expect(screen.getByTestId('image-preview-image')).toHaveAttribute(
      'src',
      'https://media.example.test/bucket/evidence.png',
    );
  });

  it('opens the original image on click when no thumbnail url exists', async () => {
    // Both thumbnail and preview use view-url
    fetchMock.mockResolvedValue(
      mockJsonResponse({ url: 'https://media.example.test/bucket/evidence.png' }),
    );
    const noThumbnailMessage: MessageResponse = {
      ...imageMessage,
      attachment: {
        ...imageMessage.attachment!,
        contentUrl: 'http://localhost:3000/api/groups/group-1/files/original/content',
      },
    };
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[noThumbnailMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    // Image loads via presigned view-url
    expect(await screen.findByAltText('evidence.png')).toHaveAttribute(
      'src',
      'https://media.example.test/bucket/evidence.png',
    );
  });

  it('loads reply image thumbnails and previews through the browser API origin', async () => {
    fetchMock
      .mockResolvedValueOnce(mockBlobResponse())
      .mockResolvedValueOnce(
        mockJsonResponse({ url: 'https://media.example.test/bucket/reply-evidence.png' }),
      );

    const replyImageMessage: MessageResponse = {
      ...replyMessage,
      replyTo: {
        ...replyMessage.replyTo!,
        type: 'image',
        textPreview: null,
        attachment: {
          ...imageMessage.attachment!,
          id: 'reply-attachment-1',
          fileId: 'reply-file-1',
          uploaderId: 'user-2',
          originalName: 'reply-evidence.png',
          contentUrl:
            'http://backend:3100/api/groups/group-1/files/reply-file-1/content',
          thumbnailUrl:
            'http://backend:3100/api/groups/group-1/files/reply-file-1/thumbnail',
        },
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[replyImageMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const thumbnail = await screen.findByAltText('reply-evidence.png');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${window.location.origin}/api/groups/group-1/files/reply-file-1/thumbnail`,
      expect.anything(),
    );

    fireEvent.click(thumbnail.closest('button')!);

    expect(await screen.findByRole('dialog', { name: 'reply-evidence.png' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${window.location.origin}/api/groups/group-1/files/reply-file-1/view-url`,
      expect.anything(),
    );
  });

  it('renders gif attachments from the original asset when thumbnail url is absent', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ url: 'https://media.example.test/bucket/animated.gif' }),
    );
    const gifMessage: MessageResponse = {
      ...imageMessage,
      attachment: {
        ...imageMessage.attachment!,
        originalName: 'animated.gif',
        mimeType: 'image/gif',
        contentUrl: 'http://localhost:3000/api/groups/group-1/files/original/content',
        thumbnailUrl: null,
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[gifMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    expect(await screen.findByAltText('animated.gif')).toHaveAttribute(
      'src',
      'https://media.example.test/bucket/animated.gif',
    );
  });

  it('downloads file attachments via presigned URL', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ url: 'https://media.example.test/bucket/release.zip?sign=abc123' }),
    );

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[fileMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '下载 release.zip' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/download-url'),
        expect.anything(),
      );
    });
  });

  it('renders reply files with independent share, download, and jump actions', () => {
    const replyFileMessage: MessageResponse = {
      ...replyMessage,
      replyTo: {
        ...replyMessage.replyTo!,
        textPreview: null,
        attachment: {
          ...fileMessage.attachment!,
          uploaderId: 'user-1',
          originalName: 'reply-release.zip',
        },
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[replyFileMessage]}
        currentUserId="user-1"
        canManageFileShare={() => true}
        onReply={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '分享 reply-release.zip' })).toBeVisible();
    expect(screen.getByRole('button', { name: '下载 reply-release.zip' })).toBeVisible();
    expect(screen.getByRole('button', { name: /回复 值班员/ })).toBeVisible();
  });
});

describe('MessagePane copy message', () => {
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: originalExecCommand,
    });
  });

  it('falls back to document.execCommand when Clipboard API is unavailable', async () => {
    const onCopyMessage = vi.fn();
    const execCommandSpy = vi.mocked(document.execCommand).mockReturnValue(true);

    vi.stubGlobal('navigator', {
      clipboard: undefined,
    });

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[copyTargetMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
        onCopyMessage={onCopyMessage}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('message-card'), { clientX: 120, clientY: 160 });
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制' }));

    await waitFor(() => {
      expect(execCommandSpy).toHaveBeenCalledWith('copy');
    });
    expect(onCopyMessage).toHaveBeenCalledWith('消息内容已复制。');
  });

  it('shows an unsupported notice when Clipboard API and fallback both fail', async () => {
    const onUnsupportedAction = vi.fn();

    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    vi.mocked(document.execCommand).mockReturnValue(false);

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[copyTargetMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
        onUnsupportedAction={onUnsupportedAction}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('message-card'), { clientX: 120, clientY: 160 });
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制' }));

    await waitFor(() => {
      expect(onUnsupportedAction).toHaveBeenCalledWith('当前环境无法访问剪贴板。');
    });
  });
});

describe('MessagePane message grouping', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the message pane pinned to the latest edge when the stream grows after mount', async () => {
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverMock.instances.push(this);
      }

      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }

    const originalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    try {
      const scrollTopDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'scrollTop',
      );
      const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'scrollHeight',
      );
      const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'clientHeight',
      );
      const originalRequestAnimationFrame = window.requestAnimationFrame;

      let scrollTopValue = 150;
      let scrollHeightValue = 600;
      const clientHeightValue = 200;

      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: (callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        },
      });

      Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
        configurable: true,
        get() {
          return scrollTopValue;
        },
        set(value: number) {
          scrollTopValue = value;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
          return scrollHeightValue;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
          return clientHeightValue;
        },
      });

      try {
        render(
          <MessagePane
            accessToken="token"
            activeGroupId="group-1"
            messages={[textMessageAfterSystem]}
            currentUserId="user-1"
            onReply={() => undefined}
          />,
        );

        await waitFor(() => {
          expect(scrollTopValue).toBe(600);
          expect(ResizeObserverMock.instances).toHaveLength(1);
        });

        scrollHeightValue = 940;

        act(() => {
          ResizeObserverMock.instances[0]!.callback(
            [] as ResizeObserverEntry[],
            ResizeObserverMock.instances[0] as unknown as ResizeObserver,
          );
        });

        await act(async () => {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          });
        });

        expect(scrollTopValue).toBe(940);
      } finally {
        Object.defineProperty(window, 'requestAnimationFrame', {
          configurable: true,
          writable: true,
          value: originalRequestAnimationFrame,
        });
        if (scrollTopDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
        }
        if (scrollHeightDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
        }
        if (clientHeightDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
        }
      }
    } finally {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalResizeObserver,
      });
    }
  });

  it('does not lose bottom stickiness before the first auto-scroll settles', async () => {
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverMock.instances.push(this);
      }

      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }

    const originalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    try {
      const scrollTopDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'scrollTop',
      );
      const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'scrollHeight',
      );
      const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'clientHeight',
      );
      const originalRequestAnimationFrame = window.requestAnimationFrame;

      let scrollTopValue = 150;
      let scrollHeightValue = 600;
      const clientHeightValue = 200;
      const rafCallbacks: FrameRequestCallback[] = [];

      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: (callback: FrameRequestCallback) => {
          rafCallbacks.push(callback);
          return rafCallbacks.length;
        },
      });

      Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
        configurable: true,
        get() {
          return scrollTopValue;
        },
        set(value: number) {
          scrollTopValue = value;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
          return scrollHeightValue;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
          return clientHeightValue;
        },
      });

      try {
        const { getByTestId } = render(
          <MessagePane
            accessToken="token"
            activeGroupId="group-1"
            messages={[textMessageAfterSystem]}
            currentUserId="user-1"
            onReply={() => undefined}
          />,
        );

        expect(scrollTopValue).toBe(150);
        expect(rafCallbacks).toHaveLength(1);

        getByTestId('workspace-surface');

        scrollHeightValue = 940;

        act(() => {
          ResizeObserverMock.instances[0]!.callback(
            [] as ResizeObserverEntry[],
            ResizeObserverMock.instances[0] as unknown as ResizeObserver,
          );
        });

        expect(rafCallbacks).toHaveLength(2);

        act(() => {
          rafCallbacks.splice(0).forEach((callback) => callback(0));
        });

        expect(scrollTopValue).toBe(940);
      } finally {
        Object.defineProperty(window, 'requestAnimationFrame', {
          configurable: true,
          writable: true,
          value: originalRequestAnimationFrame,
        });
        if (scrollTopDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
        }
        if (scrollHeightDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
        }
        if (clientHeightDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
        }
      }
    } finally {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalResizeObserver,
      });
    }
  });

  it('preserves the current reading position when older messages are prepended', async () => {
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverMock.instances.push(this);
      }

      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }

    const originalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 80;
    let scrollHeightValue = 280;
    const clientHeightValue = 200;

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older',
        text: '更早的消息',
        createdAt: '2026-04-28T07:58:00.000Z',
      };

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(280);
        expect(ResizeObserverMock.instances).toHaveLength(1);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));

      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollHeightValue = 580;

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages={false}
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      act(() => {
        ResizeObserverMock.instances[0]!.callback(
          [] as ResizeObserverEntry[],
          ResizeObserverMock.instances[0] as unknown as ResizeObserver,
        );
      });

      expect(scrollTopValue).toBe(300);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalResizeObserver,
      });
    }
  });

  it('preserves the visible message anchor instead of the total scroll height delta', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const messageOffsets = new Map<string, number>([
      ['message-2', 40],
      ['message-older', -260],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        const top = messageId ? (messageOffsets.get(messageId) ?? 0) : 0;
        return {
          bottom: top + 60,
          height: 60,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top,
          width: 500,
          x: 0,
          y: top,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older',
        text: '更早的消息',
        createdAt: '2026-04-28T07:58:00.000Z',
      };

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));

      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollHeightValue = 1500;
      messageOffsets.set('message-2', 300);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages={false}
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(260);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('does not expose an intermediate viewport jump while older messages are still loading', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const absoluteOffsets = new Map<string, number>([
      ['message-2', 40],
      ['message-older', 0],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        if (messageId) {
          const absoluteTop = absoluteOffsets.get(messageId) ?? 0;
          const top = absoluteTop - scrollTopValue;
          return {
            bottom: top + 60,
            height: 60,
            left: 0,
            right: 500,
            toJSON: () => undefined,
            top,
            width: 500,
            x: 0,
            y: top,
          } as DOMRect;
        }

        return {
          bottom: clientHeightValue,
          height: clientHeightValue,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top: 0,
          width: 500,
          x: 0,
          y: 0,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older',
        text: '更早的消息',
        createdAt: '2026-04-28T07:58:00.000Z',
      };

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      const visibleMessage = getByTestId('message-card');
      expect(visibleMessage.getBoundingClientRect().top).toBe(40);

      scrollHeightValue = 1500;
      absoluteOffsets.set('message-2', 300);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(visibleMessage.getBoundingClientRect().top).toBe(40);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('preserves an image message anchor while older messages are loading and after the image load event', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const absoluteOffsets = new Map<string, number>([
      ['message-1', 40],
      ['message-older-image', 0],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        if (messageId) {
          const absoluteTop = absoluteOffsets.get(messageId) ?? 0;
          const top = absoluteTop - scrollTopValue;
          return {
            bottom: top + 60,
            height: 60,
            left: 0,
            right: 500,
            toJSON: () => undefined,
            top,
            width: 500,
            x: 0,
            y: top,
          } as DOMRect;
        }

        return {
          bottom: clientHeightValue,
          height: clientHeightValue,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top: 0,
          width: 500,
          x: 0,
          y: 0,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older-image',
        text: '更早的图片前消息',
        createdAt: '2026-04-28T07:57:00.000Z',
      };

      const { getByRole, getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[imageMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      const imageCard = getByRole('button', { name: '全屏查看 evidence.png' }).closest(
        '[data-message-id="message-1"]',
      ) as HTMLElement;

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);
      expect(imageCard.getBoundingClientRect().top).toBe(40);

      scrollHeightValue = 1500;
      absoluteOffsets.set('message-1', 300);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, imageMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(imageCard.getBoundingClientRect().top).toBe(40);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, imageMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages={false}
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(imageCard.getBoundingClientRect().top).toBe(40);
      fireEvent.load(getByRole('img', { name: 'evidence.png' }));
      expect(imageCard.getBoundingClientRect().top).toBe(40);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('preserves a reply message anchor while older messages are loading', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const absoluteOffsets = new Map<string, number>([
      ['message-reply', 40],
      ['message-older-reply', 0],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        if (messageId) {
          const absoluteTop = absoluteOffsets.get(messageId) ?? 0;
          const top = absoluteTop - scrollTopValue;
          return {
            bottom: top + 60,
            height: 60,
            left: 0,
            right: 500,
            toJSON: () => undefined,
            top,
            width: 500,
            x: 0,
            y: top,
          } as DOMRect;
        }

        return {
          bottom: clientHeightValue,
          height: clientHeightValue,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top: 0,
          width: 500,
          x: 0,
          y: 0,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older-reply',
        text: '更早的回复前消息',
        createdAt: '2026-04-28T07:56:00.000Z',
      };

      const { getByText, getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[replyMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      const replyCard = getByText('这是带回复的消息').closest(
        '[data-message-id="message-reply"]',
      ) as HTMLElement;

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);
      expect(replyCard.getBoundingClientRect().top).toBe(40);

      scrollHeightValue = 1500;
      absoluteOffsets.set('message-reply', 300);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, replyMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(replyCard.getBoundingClientRect().top).toBe(40);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('keeps the historical reading position when the current user sends during an older message load', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 80;
    let scrollHeightValue = 600;
    const clientHeightValue = 200;

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(600);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));

      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollHeightValue = 920;

      const optimisticOwnMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-local-sending-during-history',
        text: '历史加载时发送的新消息',
        senderId: 'user-1',
        isSending: true,
        createdAt: '2026-04-28T08:04:00.000Z',
      };

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem, optimisticOwnMessage]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(0);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('does not trigger another older-load request until the user leaves the top edge and re-enters it', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const messageOffsets = new Map<string, number>([
      ['message-2', 40],
      ['message-older', -260],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        const top = messageId ? (messageOffsets.get(messageId) ?? 0) : 0;
        return {
          bottom: top + 60,
          height: 60,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top,
          width: 500,
          x: 0,
          y: top,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older',
        text: '更早的消息',
        createdAt: '2026-04-28T07:58:00.000Z',
      };

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollHeightValue = 1500;
      messageOffsets.set('message-2', 300);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages={false}
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(260);

      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollTopValue = 220;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('settles a near-zero anchor restore before re-arming older loads', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const getBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 1000;
    const clientHeightValue = 240;
    const messageOffsets = new Map<string, number>([
      ['message-2', 40],
      ['message-older', -60],
    ]);

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const messageId = this.dataset.messageId;
        const top = messageId ? (messageOffsets.get(messageId) ?? 0) : 0;
        return {
          bottom: top + 60,
          height: 60,
          left: 0,
          right: 500,
          toJSON: () => undefined,
          top,
          width: 500,
          x: 0,
          y: top,
        } as DOMRect;
      },
    });

    try {
      const handleLoadOlderMessages = vi.fn();
      const olderMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-older',
        text: '更早的消息',
        createdAt: '2026-04-28T07:58:00.000Z',
      };

      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(1000);
      });

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollHeightValue = 1060;
      messageOffsets.set('message-2', 40);

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[olderMessage, textMessageAfterSystem]}
          currentUserId="user-1"
          hasMoreOlderMessages
          isLoadingOlderMessages={false}
          onLoadOlderMessages={handleLoadOlderMessages}
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(0);

      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollTopValue = 220;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(1);

      scrollTopValue = 0;
      fireEvent.scroll(getByTestId('workspace-surface'));
      expect(handleLoadOlderMessages).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
      if (getBoundingClientRectDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'getBoundingClientRect',
          getBoundingClientRectDescriptor,
        );
      }
    }
  });

  it('does not force the message pane to the latest edge after the current user sends away from bottom', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 680;
    const clientHeightValue = 200;

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });

    try {
      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(680);
      });

      scrollTopValue = 120;
      fireEvent.scroll(getByTestId('workspace-surface'));
      scrollHeightValue = 980;

      const optimisticOwnMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-local-sending',
        text: '这是我刚发的消息',
        senderId: 'user-1',
        isSending: true,
        createdAt: '2026-04-28T08:03:00.000Z',
      };

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem, optimisticOwnMessage]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(120);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('follows the latest edge after the current user sends while already at bottom', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 680;
    const clientHeightValue = 200;

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });

    try {
      const { getByTestId, rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(680);
      });

      scrollHeightValue = 980;

      const optimisticOwnMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-local-sending',
        text: '这是我刚发的消息',
        senderId: 'user-1',
        isSending: true,
        createdAt: '2026-04-28T08:03:00.000Z',
      };

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem, optimisticOwnMessage]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(980);
      });
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('does not force another latest-edge scroll when a local sending message is confirmed in place', async () => {
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    let scrollTopValue = 120;
    let scrollHeightValue = 680;
    const clientHeightValue = 200;

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(value: number) {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeightValue;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeightValue;
      },
    });

    try {
      const sendingMessage: MessageResponse = {
        ...textMessageAfterSystem,
        id: 'message-local-sending',
        text: '这是我刚发的消息',
        senderId: 'user-1',
        isSending: true,
        createdAt: '2026-04-28T08:03:00.000Z',
      };

      const { rerender } = render(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem, sendingMessage]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      await waitFor(() => {
        expect(scrollTopValue).toBe(680);
      });

      scrollTopValue = 640;
      scrollHeightValue = 690;

      const confirmedMessage: MessageResponse = {
        ...sendingMessage,
        id: 'message-confirmed',
        isSending: undefined,
      };

      rerender(
        <MessagePane
          accessToken="token"
          activeGroupId="group-1"
          messages={[textMessageAfterSystem, confirmedMessage]}
          currentUserId="user-1"
          onReply={() => undefined}
        />,
      );

      expect(scrollTopValue).toBe(640);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      });
      if (scrollTopDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('keeps the same rendered message node when a local sending message is confirmed', () => {
    const sendingMessage: MessageResponse = {
      ...textMessageAfterSystem,
      id: 'message-local-sending',
      clientKey: 'message-local-sending',
      text: '这是我刚发的消息',
      senderId: 'user-1',
      isSending: true,
      createdAt: '2026-04-28T08:03:00.000Z',
    };

    const { rerender } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[textMessageAfterSystem, sendingMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const sendingCard = screen.getAllByTestId('message-card')[1]!;

    const confirmedMessage: MessageResponse = {
      ...sendingMessage,
      id: 'message-confirmed',
      clientKey: 'message-local-sending',
      isSending: undefined,
    };

    rerender(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[textMessageAfterSystem, confirmedMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    expect(screen.getAllByTestId('message-card')[1]).toBe(sendingCard);
    expect(sendingCard).toHaveAttribute('data-message-id', 'message-confirmed');
  });

  it('shows a clear fallback when an attachment message has been retained but its file was recycled', () => {
    const recycledImageMessage: MessageResponse = {
      ...imageMessage,
      text: '该附件已过期回收',
      attachment: null,
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[recycledImageMessage]}
        currentUserId="user-2"
        onReply={() => undefined}
      />,
    );

    const card = screen.getByTestId('message-card');
    expect(within(card).getByText('该附件已过期回收')).toBeInTheDocument();
    expect(card.querySelector('div[class*="attachmentExpired"]')).not.toBeNull();
  });

  it('does not compact a user message that follows a system message from the same sender', () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[systemMessage, textMessageAfterSystem]}
        currentUserId="user-2"
        onReply={() => undefined}
      />,
    );

    const cards = screen.getAllByTestId('message-card');
    expect(cards).toHaveLength(2);
    expect(cards[1]?.className).not.toContain('messageCompact');
    expect(within(cards[1]!).getByText('23123')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('2')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('大家好')).toBeInTheDocument();
  });
});

describe('MessagePane text rendering', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render raw HTML from message text', () => {
    const { container } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[htmlInjectionMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('safe')).toBeInTheDocument();
    expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders long markdown inline code inside the message content container', () => {
    const { container } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[markdownLongLineMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const content = container.querySelector('[class*="content"]');
    expect(content).not.toBeNull();
    expect(content?.querySelector('code')).not.toBeNull();
    expect(content).toHaveTextContent(
      'averyveryveryveryveryveryveryveryveryveryverylongtokenwithoutspaces',
    );
  });

  it('shows message-shaped skeleton rows while the initial message list is loading', () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[]}
        currentUserId="user-1"
        isLoadingMessages
        onReply={() => undefined}
      />,
    );

    expect(screen.getAllByTestId('message-skeleton-row').length).toBeGreaterThanOrEqual(4);
  });

  it('highlights only the self mention inside a text message', () => {
    const { container } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[selfMentionMessage]}
        currentUserId="user-1"
        currentUserMentionTargets={['值班员', 'user@example.com', 'user']}
        onReply={() => undefined}
      />,
    );

    const highlights = container.querySelectorAll('[data-mention-highlight="self"]');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('@值班员');
    expect(container).toHaveTextContent('@Reader');
  });

  it('does not highlight mention-like text inside inline code', () => {
    const { container } = render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[mentionInsideCodeMessage]}
        currentUserId="user-1"
        currentUserMentionTargets={['值班员', 'user@example.com', 'user']}
        onReply={() => undefined}
      />,
    );

    const highlights = container.querySelectorAll('[data-mention-highlight="self"]');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('@值班员');
    expect(container.querySelector('code')).toHaveTextContent('@值班员');
  });

  it('shows a retry button next to a failed pending upload', () => {
    const onRetryPendingUpload = vi.fn();
    const onClearPendingError = vi.fn();

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[]}
        currentUserId="user-1"
        onReply={() => undefined}
        pendingUploads={[
          {
            localId: 'upload-1',
            fileName: 'huge.zip',
            progress: {
              loaded: 0,
              total: 4096,
              percent: 0,
              speedBytesPerSec: 0,
            },
            status: 'error',
            error: 'Upload failed: 413',
          },
        ]}
        onRetryPendingUpload={onRetryPendingUpload}
        onClearPendingError={onClearPendingError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '重发' }));
    expect(onRetryPendingUpload).toHaveBeenCalledWith('upload-1');

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClearPendingError).toHaveBeenCalledWith('upload-1');
  });
});

describe('MessagePane read receipts', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows read count for current user messages and reveals read/unread names on hover', async () => {
    const messageWithReceipt: MessageResponse = {
      ...textMessageAfterSystem,
      id: 'message-receipt',
      senderId: 'user-1',
      sender: {
        id: 'user-1',
        email: 'author@example.com',
        displayName: '作者',
        avatarUrl: null,
      },
      readReceipt: {
        totalRecipients: 3,
        readCount: 1,
        unreadCount: 2,
        readBy: [
          {
            userId: 'user-2',
            email: 'read@example.com',
            displayName: '已读的人',
            avatarUrl: null,
          },
        ],
        unreadBy: [
          {
            userId: 'user-3',
            email: 'unread-a@example.com',
            displayName: '未读甲',
            avatarUrl: null,
          },
          {
            userId: 'user-4',
            email: 'unread-b@example.com',
            displayName: '未读乙',
            avatarUrl: null,
          },
        ],
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[messageWithReceipt]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const receiptTrigger = screen.getByRole('button', { name: '已读回执：1/3' });
    expect(receiptTrigger).toBeInTheDocument();

    fireEvent.mouseEnter(receiptTrigger);

    expect(await screen.findByRole('dialog', { name: '已读回执' })).toBeInTheDocument();
    expect(screen.getByText('已读 1')).toBeInTheDocument();
    expect(screen.getByText('未读 2')).toBeInTheDocument();
    expect(screen.getByText('已读的人')).toBeInTheDocument();
    expect(screen.getByText('未读甲')).toBeInTheDocument();
    expect(screen.getByText('未读乙')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '已读回执' })).toBeNull();
    });

    fireEvent.mouseEnter(receiptTrigger);
    expect(await screen.findByRole('dialog', { name: '已读回执' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '已读回执' })).toBeNull();
    });
  });

  it('shows a checkmark when all human recipients have read the message', () => {
    const fullyReadMessage: MessageResponse = {
      ...textMessageAfterSystem,
      id: 'message-fully-read',
      senderId: 'user-1',
      sender: {
        id: 'user-1',
        email: 'author@example.com',
        displayName: '作者',
        avatarUrl: null,
      },
      readReceipt: {
        totalRecipients: 2,
        readCount: 2,
        unreadCount: 0,
        readBy: [
          {
            userId: 'user-2',
            email: 'read-a@example.com',
            displayName: '已读甲',
            avatarUrl: null,
          },
          {
            userId: 'user-3',
            email: 'read-b@example.com',
            displayName: '已读乙',
            avatarUrl: null,
          },
        ],
        unreadBy: [],
      },
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[fullyReadMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    const receiptTrigger = screen.getByRole('button', { name: '已读回执：2/2' });
    expect(receiptTrigger).toBeInTheDocument();
    expect(within(receiptTrigger).getByText('✓')).toBeInTheDocument();
  });

  it('does not show read receipts for messages from other users', () => {
    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[textMessageAfterSystem]}
        currentUserId="user-9"
        onReply={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /^已读回执：/ })).toBeNull();
  });

  it('does not show read receipts for old messages outside the tracking window', () => {
    const oldMessage: MessageResponse = {
      ...textMessageAfterSystem,
      id: 'message-old',
      createdAt: '2026-04-01T08:01:00.000Z',
      readReceipt: null,
    };

    render(
      <MessagePane
        accessToken="token"
        activeGroupId="group-1"
        messages={[oldMessage]}
        currentUserId="user-1"
        onReply={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /^已读回执：/ })).toBeNull();
  });
});
