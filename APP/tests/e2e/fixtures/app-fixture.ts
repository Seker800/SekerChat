import type { Page, Route } from '@playwright/test';
import { getDefaultRolePermissions } from '@sekerchat/shared';

const sessionStorageKey = 'sekerchat.session';
const fixedNowIso = '2026-04-10T12:00:00.000Z';

const currentUser = {
  id: 'user-admin',
  email: 'admin@local.invalid',
  displayName: '管理员',
  avatarUrl: null,
  role: 'ADMIN',
  createdAt: '2026-04-01T09:00:00.000Z',
};

const defaultRolePermissions = getDefaultRolePermissions();

const defaultArtifactConfirmation = {
  isConfirmed: false,
  confirmedAt: null,
  confirmedByUserId: null,
  confirmedByDisplayName: null,
} as const;

const groups = [
  {
    id: 'group-1',
    name: '值班提醒群',
    category: '运维',
    isDM: false,
    latestMessage: null,
    serverAvatarUrl: null,
    workState: null,
    artifactConfirmation: defaultArtifactConfirmation,
    archivedAt: null,
    createdAt: '2026-03-29T09:00:00.000Z',
    updatedAt: '2026-04-03T08:30:00.000Z',
    createdById: 'user-admin',
    currentUserRole: 'ADMIN',
    unreadCount: 0,

    members: [
      {
        userId: 'user-admin',
        email: 'admin@local.invalid',
        displayName: '管理员',
        avatarUrl: null,
        role: 'ADMIN',
        isOnline: true,
        joinedAt: '2026-03-29T09:00:00.000Z',
      },
      {
        userId: 'user-member',
        email: 'member@local.invalid',
        displayName: '值班同学',
        avatarUrl: null,
        role: 'MEMBER',
        isOnline: true,
        joinedAt: '2026-03-29T10:00:00.000Z',
      },
    ],
  },
  {
    id: 'group-2',
    name: '设计同步',
    category: '设计',
    isDM: false,
    latestMessage: null,
    serverAvatarUrl: null,
    workState: null,
    artifactConfirmation: defaultArtifactConfirmation,
    archivedAt: null,
    createdAt: '2026-03-25T09:00:00.000Z',
    updatedAt: '2026-04-02T15:30:00.000Z',
    createdById: 'user-admin',
    currentUserRole: 'ADMIN',
    unreadCount: 0,

    members: [
      {
        userId: 'user-admin',
        email: 'admin@local.invalid',
        displayName: '管理员',
        avatarUrl: null,
        role: 'ADMIN',
        isOnline: true,
        joinedAt: '2026-03-25T09:00:00.000Z',
      },
    ],
  },
];

const discoverableGroups = [
  {
    id: 'group-3',
    name: '已归档群',
    category: '历史',
    isDM: false,
    latestMessage: null,
    serverAvatarUrl: null,
    workState: null,
    artifactConfirmation: defaultArtifactConfirmation,
    archivedAt: '2026-04-01T09:00:00.000Z',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    createdById: 'user-admin',
    currentUserRole: 'ADMIN',
    unreadCount: 0,

    members: [
      {
        userId: 'user-admin',
        email: 'admin@local.invalid',
        displayName: '管理员',
        avatarUrl: null,
        role: 'ADMIN',
        isOnline: false,
        joinedAt: '2026-03-20T09:00:00.000Z',
      },
    ],
  },
];

const allGroups = [...groups, ...discoverableGroups];

const messagesByGroupId = {
  'group-1': {
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
      {
        id: 'message-2',
        groupId: 'group-1',
        senderId: 'user-admin',
        type: 'text',
        text: '已收到，我会在 17:30 前同步提醒机器人。',
        mentionedUserIds: [],
        replyTo: {
          id: 'message-1',
          senderId: 'user-member',
          type: 'text',
          textPreview: '今天 18:00 前确认值班排班。',
          sender: {
            id: 'user-member',
            email: 'member@local.invalid',
            displayName: '值班同学',
          },
        },
        attachment: null,
        createdAt: '2026-04-03T08:23:00.000Z',
        sender: {
          id: 'user-admin',
          email: 'admin@local.invalid',
          displayName: '管理员',
        },
      },
    ],
  },
  'group-2': {
    groupId: 'group-2',
    items: [],
  },
  'group-3': {
    groupId: 'group-3',
    items: [],
  },
};

const inviteCandidatesByGroupId = {
  'group-1': [
    {
      id: 'user-new',
      email: 'new.member@local.invalid',
      displayName: '新成员',
    },
  ],
  'group-2': [],
  'group-3': [],
};

const dmCandidates = [
  {
    id: 'user-member',
    email: 'member@local.invalid',
    displayName: '值班同学',
  },
  {
    id: 'user-new',
    email: 'new.member@local.invalid',
    displayName: '新成员',
  },
];

const subscriptionPosts = [
  {
    id: 'subscription-post-1',
    status: 'PUBLISHED',
    title: 'SekerChat Desktop 1.0',
    bodyPreview: '本次版本改进了大文件上传恢复能力，并优化了消息栏性能。',
    tags: ['桌面端', '更新'],
    isPinned: true,
    isConfirmed: false,
    isRecipient: true,
    confirmedAt: null,
    confirmationProgress: { confirmedCount: 0, recipientCount: 2 },
    publishedAt: '2026-04-10T08:30:00.000Z',
    updatedAt: '2026-04-10T08:30:00.000Z',
    author: {
      id: currentUser.id,
      displayName: currentUser.displayName,
      email: currentUser.email,
    },
    attachmentCount: 1,
    hasAttachments: true,
  },
  {
    id: 'subscription-post-2',
    status: 'PUBLISHED',
    title: '文章使用指南',
    bodyPreview: '在这里可以统一查看团队发布的资料与更新。',
    tags: ['指南'],
    isPinned: false,
    isConfirmed: true,
    isRecipient: true,
    confirmedAt: '2026-04-09T04:00:00.000Z',
    confirmationProgress: { confirmedCount: 1, recipientCount: 2 },
    publishedAt: '2026-04-09T03:00:00.000Z',
    updatedAt: '2026-04-09T03:00:00.000Z',
    author: {
      id: currentUser.id,
      displayName: currentUser.displayName,
      email: currentUser.email,
    },
    attachmentCount: 0,
    hasAttachments: false,
  },
  {
    id: 'subscription-post-3',
    status: 'PUBLISHED',
    title: '七月维护通知',
    bodyPreview: '本周六凌晨将进行例行维护，请提前保存正在处理的工作。',
    tags: ['维护'],
    isPinned: false,
    isConfirmed: false,
    isRecipient: true,
    confirmedAt: null,
    confirmationProgress: { confirmedCount: 0, recipientCount: 2 },
    publishedAt: '2026-04-08T05:00:00.000Z',
    updatedAt: '2026-04-08T05:00:00.000Z',
    author: {
      id: currentUser.id,
      displayName: currentUser.displayName,
      email: currentUser.email,
    },
    attachmentCount: 0,
    hasAttachments: false,
  },
];

const subscriptionPostDetails = {
  'subscription-post-1': {
    ...subscriptionPosts[0],
    body: [
      '## Desktop 1.0 更新说明',
      '',
      '本次版本改进了大文件上传恢复能力，并优化了消息栏性能。',
      '',
      '- 支持断点续传',
      '- 改进下载体验',
    ].join('\n'),
    attachments: [
      {
        id: 'subscription-attachment-1',
        originalName: 'SekerChat-Desktop-1.0.zip',
        mimeType: 'application/zip',
        size: 734003200,
        sha256: '7f32f6d675aa9dbdfd5b4bf02dbdea514f72bb42b60a02d8f7cd3efed7a12a91',
        downloadCount: 12,
        usage: 'DOWNLOADABLE_FILE',
      },
    ],
  },
  'subscription-post-2': {
    ...subscriptionPosts[1],
    body: '## 使用指南\n\n在这里可以统一查看团队发布的资料与更新。',
    attachments: [],
  },
  'subscription-post-3': {
    ...subscriptionPosts[2],
    body: '## 维护安排\n\n本周六凌晨将进行例行维护，请提前保存正在处理的工作。',
    attachments: [],
  },
};

const subscriptionDraft = {
  id: 'subscription-draft-1',
  status: 'DRAFT',
  title: 'Markdown 新文章',
  body: '正文',
  tags: ['更新', '桌面端'],
  isPinned: false,
  isConfirmed: false,
  isRecipient: false,
  confirmedAt: null,
  confirmationProgress: null,
  publishedAt: null,
  updatedAt: fixedNowIso,
  author: {
    id: currentUser.id,
    displayName: currentUser.displayName,
    email: currentUser.email,
  },
  attachments: [],
};

const emptyArtifactsByGroupId = {
  'group-1': [],
  'group-2': [],
  'group-3': [],
};

const workStateByGroupId = {
  'group-1': {
    id: 'state-1',
    groupId: 'group-1',
    status: '打包',
    reason: '等待管理员确认值班安排。',
    sourceMessageIds: ['message-1'],
    updatedByActorType: 'human_user',
    updatedByActorId: 'user-admin',
    createdAt: '2026-04-03T08:21:00.000Z',
    updatedAt: '2026-04-03T08:21:00.000Z',
  },
  'group-2': {
    id: 'state-2',
    groupId: 'group-2',
    status: '初始',
    reason: null,
    sourceMessageIds: [],
    updatedByActorType: 'human_user',
    updatedByActorId: 'user-admin',
    createdAt: '2026-04-02T15:30:00.000Z',
    updatedAt: '2026-04-02T15:30:00.000Z',
  },
  'group-3': {
    id: 'state-3',
    groupId: 'group-3',
    status: '完成',
    reason: '已归档。',
    sourceMessageIds: [],
    updatedByActorType: 'human_user',
    updatedByActorId: 'user-admin',
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-01T09:00:00.000Z',
  },
};

function json(route: Route, payload: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}
function buildPersistedSession() {
  return {
    accessToken: 'playwright-access-token',
    refreshToken: 'playwright-refresh-token',
    user: {
      id: currentUser.id,
      email: currentUser.email,
      displayName: currentUser.displayName,
      role: currentUser.role,
    },
  };
}
async function installRealtimeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url: string;
      readyState = FakeWebSocket.CONNECTING;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        window.setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 0);
      }

      close(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent('close'));
      }

      send(): void {
        // no-op for browser tests
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket,
    });
  });
}

export async function installAuthenticatedApp(page: Page): Promise<void> {
  await installAuthenticatedAppWithOptions(page);
}

export async function installAuthenticatedAppWithOptions(
  page: Page,
  options: {
    groupsResponse?: { status: number; body: unknown };
    dmsResponse?: { status: number; body: unknown };
    dmCandidatesResponse?: { status: number; body: unknown };
    messagesResponse?: { status: number; body: unknown };
    messagesDelayMs?: number;
    workStateResponse?: { status: number; body: unknown };
    artifactsResponse?: { status: number; body: unknown };
    subscriptionPendingConfirmationCount?: number;
    groupDetailDelayMs?: number;
    currentUserOverride?: Partial<typeof currentUser>;
    currentUserPermissions?: Array<{ key: string; label: string; description: string }>;
  } = {},
): Promise<void> {
  const effectiveCurrentUser = {
    ...currentUser,
    ...options.currentUserOverride,
  };
  const effectiveCurrentUserPermissions =
    options.currentUserPermissions ??
    (effectiveCurrentUser.role === 'MEMBER'
      ? []
      : [
          {
            key: 'manage_system_config',
            label: '系统配置',
            description: '管理系统配置与素材处理队列',
          },
        ]);
  const confirmedSubscriptionPostIds = new Set(
    subscriptionPosts.filter((post) => post.isConfirmed).map((post) => post.id),
  );

  await installRealtimeStub(page);
  await page.addInitScript(
    ({ nowIso }) => {
      const fixedNow = new Date(nowIso).valueOf();
      const originalDateNow = Date.now.bind(Date);
      Date.now = () => fixedNow;
      Object.defineProperty(window, '__playwrightOriginalDateNow', {
        configurable: true,
        value: originalDateNow,
      });
    },
    {
      nowIso: fixedNowIso,
    },
  );
  await page.addInitScript(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      storageKey: sessionStorageKey,
      session: {
        accessToken: 'playwright-access-token',
        refreshToken: 'playwright-refresh-token',
        user: {
          id: effectiveCurrentUser.id,
          email: effectiveCurrentUser.email,
          displayName: effectiveCurrentUser.displayName,
          role: effectiveCurrentUser.role,
        },
      },
    },
  );

  await page.route('**/api/**', async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());

    if (pathname === '/api/auth/refresh') {
      await json(route, {
        accessToken: 'playwright-access-token',
        user: {
          id: effectiveCurrentUser.id,
          email: effectiveCurrentUser.email,
          displayName: effectiveCurrentUser.displayName,
          avatarUrl: null,
          role: effectiveCurrentUser.role,
        },
      });
      return;
    }

    if (pathname === '/api/users/me') {
      await json(route, effectiveCurrentUser);
      return;
    }

    if (pathname === '/api/users/me/capabilities') {
      await json(route, {
        actorType: 'HUMAN_USER',
        user: {
          id: effectiveCurrentUser.id,
          email: effectiveCurrentUser.email,
          displayName: effectiveCurrentUser.displayName,
          role: effectiveCurrentUser.role,
        },
        permissions: effectiveCurrentUserPermissions,
        allowedCommands: ['msg.send', 'msg.reply', 'task.create', 'admin.discovery'],
        scopes: {
          groups: 'membership',
          admin: true,
        },
      });
      return;
    }

    if (pathname === '/api/system-config') {
      await json(route, {
        subscriptionAttachmentMaxMB: String(5 * 1024),
        rolePermissions: JSON.stringify(defaultRolePermissions),
      });
      return;
    }

    if (pathname === '/api/subscriptions/summary') {
      await json(route, {
        pendingConfirmationCount:
          options.subscriptionPendingConfirmationCount ??
          subscriptionPosts.length - confirmedSubscriptionPostIds.size,
      });
      return;
    }

    if (pathname === '/api/subscriptions' && route.request().method() === 'GET') {
      if (searchParams.get('manage') === 'true') {
        await json(route, {
          items: [...Object.values(subscriptionPostDetails), subscriptionDraft],
        });
        return;
      }
      const items = subscriptionPosts
        .map((post) => ({
          ...post,
          isConfirmed: confirmedSubscriptionPostIds.has(post.id),
          confirmedAt: confirmedSubscriptionPostIds.has(post.id) ? fixedNowIso : null,
        }))
        .sort((left, right) => Number(left.isConfirmed) - Number(right.isConfirmed));
      await json(route, {
        items,
        pendingConfirmationCount: items.filter((post) => !post.isConfirmed).length,
      });
      return;
    }

    if (pathname === '/api/subscriptions' && route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as {
        title?: string;
        body?: string;
        tags?: string[];
      };
      await json(route, { ...subscriptionDraft, ...input });
      return;
    }

    const subscriptionConfirmationMatch =
      /^\/api\/subscriptions\/(subscription-post-[^/]+)\/confirmation$/.exec(pathname);
    if (subscriptionConfirmationMatch && route.request().method() === 'PUT') {
      confirmedSubscriptionPostIds.add(subscriptionConfirmationMatch[1]);
      await json(route, {
        isConfirmed: true,
        confirmedAt: fixedNowIso,
        pendingConfirmationCount: subscriptionPosts.length - confirmedSubscriptionPostIds.size,
      });
      return;
    }

    const subscriptionConfirmationsMatch =
      /^\/api\/subscriptions\/(subscription-post-[^/]+)\/confirmations$/.exec(pathname);
    if (subscriptionConfirmationsMatch && route.request().method() === 'GET') {
      await json(route, {
        postId: subscriptionConfirmationsMatch[1],
        confirmedCount: 1,
        recipientCount: 2,
        confirmed: [
          {
            userId: 'user-member',
            displayName: '值班同学',
            email: 'member@local.invalid',
            confirmedAt: fixedNowIso,
          },
        ],
        pending: [
          {
            userId: 'user-new',
            displayName: '新成员',
            email: 'new.member@local.invalid',
          },
        ],
      });
      return;
    }

    const subscriptionDetailMatch = /^\/api\/subscriptions\/(subscription-post-[^/]+)$/.exec(
      pathname,
    );
    if (subscriptionDetailMatch && route.request().method() === 'DELETE') {
      await json(route, { postId: subscriptionDetailMatch[1], deleted: true });
      return;
    }
    if (subscriptionDetailMatch && route.request().method() === 'GET') {
      const detail =
        subscriptionPostDetails[subscriptionDetailMatch[1] as keyof typeof subscriptionPostDetails];
      await json(
        route,
        detail
          ? {
              ...detail,
              isConfirmed: confirmedSubscriptionPostIds.has(subscriptionDetailMatch[1]),
              confirmedAt: confirmedSubscriptionPostIds.has(subscriptionDetailMatch[1])
                ? fixedNowIso
                : null,
            }
          : { message: 'Not found.' },
        detail ? 200 : 404,
      );
      return;
    }

    if (
      pathname === '/api/subscriptions/subscription-draft-1' &&
      route.request().method() === 'PATCH'
    ) {
      const input = route.request().postDataJSON() as {
        title?: string;
        body?: string;
        tags?: string[];
      };
      await json(route, { ...subscriptionDraft, ...input });
      return;
    }

    if (pathname === '/api/uploads/initiate' && route.request().method() === 'POST') {
      await json(route, {
        id: 'subscription-upload-1',
        kind: 'SUBSCRIPTION_ATTACHMENT',
        status: 'INITIATED',
        groupId: null,
        subscriptionAttachmentId: 'subscription-image-1',
        originalName: 'screenshot.png',
        mimeType: 'image/png',
        size: 7,
        multipartUploadId: 'multipart-subscription-1',
        partSizeBytes: 32 * 1024 * 1024,
        createdAt: fixedNowIso,
      });
      return;
    }

    if (
      pathname === '/api/uploads/subscription-upload-1/parts/1' &&
      route.request().method() === 'PUT'
    ) {
      await json(route, {
        uploadSessionId: 'subscription-upload-1',
        partNumber: 1,
        etag: 'etag-1',
      });
      return;
    }

    if (
      pathname === '/api/uploads/subscription-upload-1/complete' &&
      route.request().method() === 'POST'
    ) {
      await json(route, {
        kind: 'SUBSCRIPTION_ATTACHMENT',
        attachment: {
          id: 'subscription-image-1',
          postId: 'subscription-draft-1',
          uploaderId: currentUser.id,
          originalName: 'screenshot.png',
          mimeType: 'image/png',
          size: 7,
          sha256: 'abc123',
          downloadCount: 0,
          usage: 'INLINE_IMAGE',
          createdAt: fixedNowIso,
        },
      });
      return;
    }

    if (
      pathname === '/api/subscriptions/attachments/subscription-image-1/view-url' &&
      route.request().method() === 'GET'
    ) {
      await json(route, {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        originalName: 'screenshot.png',
        mimeType: 'image/png',
        size: 7,
      });
      return;
    }

    if (pathname === '/api/groups') {
      if (options.groupsResponse) {
        await json(route, options.groupsResponse.body, options.groupsResponse.status);
        return;
      }

      await json(route, groups);
      return;
    }

    if (pathname === '/api/dm') {
      if (route.request().method() === 'GET') {
        if (options.dmsResponse) {
          await json(route, options.dmsResponse.body, options.dmsResponse.status);
          return;
        }

        await json(route, []);
        return;
      }

      if (route.request().method() === 'POST') {
        await json(route, {
          id: 'dm-1',
          name: 'dm',
          category: '私聊',
          isDM: true,
          latestMessage: null,
          serverAvatarUrl: null,
          workState: null,
          artifactConfirmation: {
            isConfirmed: false,
            confirmedAt: null,
            confirmedByUserId: null,
            confirmedByDisplayName: null,
          },
          archivedAt: null,
          createdAt: fixedNowIso,
          updatedAt: fixedNowIso,
          createdById: effectiveCurrentUser.id,
          currentUserRole: 'MEMBER',
          unreadCount: 0,
          members: [
            {
              userId: effectiveCurrentUser.id,
              email: effectiveCurrentUser.email,
              displayName: effectiveCurrentUser.displayName,
              role: 'MEMBER',
              joinedAt: fixedNowIso,
            },
            {
              userId: 'user-member',
              email: 'member@local.invalid',
              displayName: '值班同学',
              role: 'MEMBER',
              joinedAt: fixedNowIso,
            },
          ],
        });
        return;
      }
    }

    const messagesMatch = /^\/api\/groups\/([^/]+)\/messages$/.exec(pathname);
    if (messagesMatch) {
      if (options.messagesDelayMs && options.messagesDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.messagesDelayMs));
      }
      if (options.messagesResponse) {
        await json(route, options.messagesResponse.body, options.messagesResponse.status);
        return;
      }
      const payload = messagesByGroupId[messagesMatch[1] as keyof typeof messagesByGroupId];
      await json(route, payload ?? { groupId: messagesMatch[1], items: [] });
      return;
    }

    const artifactsMatch = /^\/api\/groups\/([^/]+)\/artifacts$/.exec(pathname);
    if (artifactsMatch) {
      if (options.artifactsResponse) {
        await json(route, options.artifactsResponse.body, options.artifactsResponse.status);
        return;
      }
      const payload =
        emptyArtifactsByGroupId[artifactsMatch[1] as keyof typeof emptyArtifactsByGroupId] ?? [];
      await json(route, payload);
      return;
    }

    const workStateMatch = /^\/api\/groups\/([^/]+)\/work-state$/.exec(pathname);
    if (workStateMatch) {
      if (options.workStateResponse) {
        await json(route, options.workStateResponse.body, options.workStateResponse.status);
        return;
      }
      const payload = workStateByGroupId[workStateMatch[1] as keyof typeof workStateByGroupId] ?? {
        id: null,
        groupId: workStateMatch[1],
        status: '初始',
        reason: null,
        sourceMessageIds: [],
        updatedByActorType: null,
        updatedByActorId: null,
        createdAt: null,
        updatedAt: null,
      };
      await json(route, payload);
      return;
    }

    const inviteCandidatesMatch = /^\/api\/groups\/([^/]+)\/invite-candidates$/.exec(pathname);
    if (inviteCandidatesMatch) {
      const groupId = inviteCandidatesMatch[1] ?? 'group-1';
      const payload =
        inviteCandidatesByGroupId[groupId as keyof typeof inviteCandidatesByGroupId] ?? [];
      await json(route, payload);
      return;
    }

    if (pathname === '/api/users/dm-candidates') {
      if (options.dmCandidatesResponse) {
        await json(route, options.dmCandidatesResponse.body, options.dmCandidatesResponse.status);
        return;
      }

      await json(route, dmCandidates);
      return;
    }

    if (pathname === '/api/groups/admin/discovery') {
      const scope = searchParams.get('scope') ?? 'archived';
      const search = searchParams.get('search')?.trim() ?? '';
      const filteredGroups = allGroups.filter((group) => {
        if (scope === 'archived' && !group.archivedAt) {
          return false;
        }

        if (search && !`${group.name} ${group.category}`.includes(search)) {
          return false;
        }

        return true;
      });

      await json(
        route,
        filteredGroups.map((group) => ({
          id: group.id,
          name: group.name,
          archivedAt: group.archivedAt,
          updatedAt: group.updatedAt,
          memberCount: group.members.length,
          isCurrentUserMember: true,
          canSelfJoin: false,
          currentUserRole: group.currentUserRole,

          visibilityReason: group.archivedAt ? 'archived' : 'member',
          createdBy: {
            id: currentUser.id,
            email: currentUser.email,
            displayName: currentUser.displayName,
          },
        })),
      );
      return;
    }

    const groupMatch = /^\/api\/groups\/([^/]+)$/.exec(pathname);
    if (groupMatch) {
      const group = allGroups.find((item) => item.id === groupMatch[1]);
      if (group && options.groupDetailDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.groupDetailDelayMs));
      }
      await json(route, group ?? { message: 'Not found.' }, group ? 200 : 404);
      return;
    }

    await json(
      route,
      {
        message: `Unhandled Playwright mock for ${route.request().method()} ${pathname}`,
      },
      404,
    );
  });
}
