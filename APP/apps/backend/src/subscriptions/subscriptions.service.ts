import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionAttachmentUsage,
  SubscriptionAttachmentStatus,
  SubscriptionPostStatus,
} from '@prisma/client';
import { AvatarsService } from '../avatars/avatars.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RangeNotSatisfiableException } from '../common/range-parser';
import { OutboxService } from '../outbox/outbox.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import {
  CreateSubscriptionPostDto,
  UpdateSubscriptionPostDto,
} from './dto/upsert-subscription-post.dto';
import { buildSubscriptionBodyPreview, isSubscriptionManagerRole } from './subscription-policy';
import { SubscriptionRealtimePublisher } from './subscription-realtime-publisher.service';
import { SubscriptionStorageService } from './subscription-storage.service';

const subscriptionPostInclude = {
  _count: { select: { views: true } },
  author: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  attachments: {
    where: { status: SubscriptionAttachmentStatus.READY },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SubscriptionPostInclude;

type SubscriptionPostRecord = Prisma.SubscriptionPostGetPayload<{
  include: typeof subscriptionPostInclude;
}>;

type SubscriptionPostWithViews = SubscriptionPostRecord & {
  views?: Array<{
    userId: string;
    firstViewedAt: Date;
    user: { displayName: string | null; email: string; avatarStorageKey: string | null };
  }>;
};

const viewerSelect = {
  userId: true,
  firstViewedAt: true,
  user: { select: { displayName: true, email: true, avatarStorageKey: true } },
} satisfies Prisma.SubscriptionPostViewSelect;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly outboxService: OutboxService,
    private readonly realtimePublisher: SubscriptionRealtimePublisher,
    private readonly storageService?: SubscriptionStorageService,
    private readonly avatarsService?: AvatarsService,
  ) {}

  async canManage(actor: AuthenticatedUser): Promise<boolean> {
    if (!isSubscriptionManagerRole(actor.role)) return false;
    return this.permissionService.hasPermission(actor.role, 'manage_subscription_posts');
  }

  /** Compatibility response: articles no longer require acknowledgement. */
  async getSummary(_userId: string) {
    return { pendingConfirmationCount: 0, unreadCount: 0 };
  }

  async listPublished(_actor: AuthenticatedUser, cursor?: string) {
    const posts = await this.prisma.subscriptionPost.findMany({
      where: { status: SubscriptionPostStatus.PUBLISHED },
      include: subscriptionPostInclude,
      orderBy: [
        { pinnedAt: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = posts.slice(0, 100);
    return {
      items: page.map((post) => this.serializePostSummary(post)),
      nextCursor: posts.length > 100 ? page.at(-1)!.id : null,
      pendingConfirmationCount: 0,
      unreadCount: 0,
    };
  }

  async listManageable(actor: AuthenticatedUser, status?: SubscriptionPostStatus, cursor?: string) {
    await this.assertCanManage(actor);
    const posts = await this.prisma.subscriptionPost.findMany({
      where: status ? { status } : undefined,
      include: subscriptionPostInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = posts.slice(0, 100);
    return {
      nextCursor: posts.length > 100 ? page.at(-1)!.id : null,
      items: page.map((post) => this.serializePost(post)),
    };
  }

  async getPublishedPost(_actor: AuthenticatedUser, postId: string) {
    const post = await this.prisma.subscriptionPost.findFirst({
      where: { id: postId, status: SubscriptionPostStatus.PUBLISHED },
      include: {
        ...subscriptionPostInclude,
        views: { select: viewerSelect, orderBy: [{ firstViewedAt: 'asc' }, { userId: 'asc' }] },
      },
    });
    if (!post) throw new NotFoundException('文章不存在。');
    return this.serializePost(post);
  }

  async recordView(userId: string, postId: string) {
    return this.prisma.$transaction(async (transaction) => {
      // Coordinate with withdraw/delete so an unpublished article cannot gain views.
      const [post] = await transaction.$queryRaw<
        Array<{ id: string; status: SubscriptionPostStatus }>
      >(Prisma.sql`
        SELECT "id", "status" FROM "SubscriptionPost" WHERE "id" = ${postId} FOR SHARE
      `);
      if (!post) throw new NotFoundException('文章不存在。');
      if (post.status !== SubscriptionPostStatus.PUBLISHED)
        throw new ConflictException('文章未发布或已撤回。');
      // Database uniqueness makes concurrent retries safe and preserves the first timestamp.
      const created = await transaction.subscriptionPostView.createMany({
        data: [{ postId, userId }],
        skipDuplicates: true,
      });
      if (created.count)
        await this.enqueueSubscriptionChanged(transaction, {
          postId,
          reason: 'viewed',
          actorUserId: userId,
        });
      const viewers = await this.loadViewers(transaction, postId);
      return { postId, viewCount: viewers.length, viewers };
    });
  }

  private async loadViewers(
    transaction: Pick<Prisma.TransactionClient, 'subscriptionPostView'>,
    postId: string,
  ) {
    const rows = await transaction.subscriptionPostView.findMany({
      where: { postId },
      select: viewerSelect,
      orderBy: [{ firstViewedAt: 'asc' }, { userId: 'asc' }],
    });
    return this.serializeViewers(rows);
  }

  private serializeViewers(rows: NonNullable<SubscriptionPostWithViews['views']>) {
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.user.displayName,
      email: row.user.email,
      avatarUrl:
        this.avatarsService?.buildUserAvatarUrl(row.userId, row.user.avatarStorageKey) ?? null,
      firstViewedAt: row.firstViewedAt,
    }));
  }

  async createDraft(actor: AuthenticatedUser, dto: CreateSubscriptionPostDto) {
    await this.assertCanManage(actor);
    const data = this.normalizePostInput(dto, { allowEmptyTitle: true });
    const post = await this.prisma.subscriptionPost.create({
      data: {
        title: data.title!,
        body: data.body ?? '',
        tags: data.tags ?? [],
        authorId: actor.sub,
        status: SubscriptionPostStatus.DRAFT,
        auditLogs: {
          create: {
            actorId: actor.sub,
            action: 'created',
          },
        },
      },
      include: subscriptionPostInclude,
    });
    return this.serializePost(post);
  }

  async updatePost(actor: AuthenticatedUser, postId: string, dto: UpdateSubscriptionPostDto) {
    await this.assertCanManage(actor);
    const current = await this.getManageablePostOrThrow(postId);
    const data = this.normalizePostInput(dto, {
      allowEmptyTitle: current.status === SubscriptionPostStatus.DRAFT,
    });
    const post = await this.prisma.subscriptionPost.update({
      where: { id: postId },
      data: {
        ...data,
        auditLogs: { create: { actorId: actor.sub, action: 'updated' } },
      },
      include: subscriptionPostInclude,
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'updated' });
    return this.serializePost(post);
  }

  async publish(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const now = new Date();
    const post = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SubscriptionPost" WHERE id = ${postId} FOR UPDATE`;
      const current = await transaction.subscriptionPost.findUnique({
        where: { id: postId },
        include: {
          attachments: true,
        },
      });
      if (!current) {
        throw new NotFoundException('文章草稿不存在。');
      }
      if (current.status !== SubscriptionPostStatus.DRAFT) {
        throw new BadRequestException('只有草稿可以发布。');
      }
      if (!current.title.trim()) {
        throw new BadRequestException('发布前必须填写标题。');
      }
      if (
        current.attachments.some(
          (attachment) => attachment.status !== SubscriptionAttachmentStatus.READY,
        )
      ) {
        throw new BadRequestException('仍有附件未上传完成，请完成后再发布。');
      }
      const updated = await transaction.subscriptionPost.update({
        where: { id: postId },
        data: {
          status: SubscriptionPostStatus.PUBLISHED,
          publishedAt: now,
          withdrawnAt: null,
        },
        include: subscriptionPostInclude,
      });
      await transaction.subscriptionAuditLog.create({
        data: { postId, actorId: actor.sub, action: 'published' },
      });
      await this.enqueueSubscriptionChanged(transaction, {
        postId,
        reason: 'published',
      });
      return updated;
    });
    return this.serializePost(post);
  }

  async withdraw(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const post = await this.prisma.$transaction(async (transaction) => {
      const [current] = await transaction.$queryRaw<Array<{
        id: string;
        status: SubscriptionPostStatus;
      }>>(Prisma.sql`
        SELECT "id", "status"
        FROM "SubscriptionPost"
        WHERE "id" = ${postId}
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('文章不存在。');
      if (current.status !== SubscriptionPostStatus.PUBLISHED) {
        throw new BadRequestException('只有已发布文章可以撤回。');
      }
      return transaction.subscriptionPost.update({
        where: { id: postId },
        data: {
          status: SubscriptionPostStatus.WITHDRAWN,
          withdrawnAt: new Date(),
          pinnedAt: null,
          auditLogs: { create: { actorId: actor.sub, action: 'withdrawn' } },
        },
        include: subscriptionPostInclude,
      });
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'withdrawn' });
    return this.serializePost(post);
  }

  async setPinned(actor: AuthenticatedUser, postId: string, pinned: boolean) {
    await this.assertCanManage(actor);
    const current = await this.getManageablePostOrThrow(postId);
    if (current.status !== SubscriptionPostStatus.PUBLISHED) {
      throw new BadRequestException('只有已发布文章可以置顶。');
    }
    const post = await this.prisma.subscriptionPost.update({
      where: { id: postId },
      data: {
        pinnedAt: pinned ? new Date() : null,
        auditLogs: { create: { actorId: actor.sub, action: pinned ? 'pinned' : 'unpinned' } },
      },
      include: subscriptionPostInclude,
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'pinned' });
    return this.serializePost(post);
  }

  async deletePost(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const post = await this.prisma.subscriptionPost.findUnique({
      where: { id: postId },
      include: { attachments: true },
    });
    if (!post) {
      throw new NotFoundException('文章不存在。');
    }
    await this.prisma.subscriptionPost.delete({ where: { id: postId } });
    if (this.storageService) {
      await Promise.allSettled(
        post.attachments.map((attachment) =>
          this.storageService!.deleteObject(attachment.storageKey),
        ),
      );
    }
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'deleted' });
    return { postId, deleted: true };
  }

  /** @deprecated Old explicit confirmation is treated as an actual article view. */
  async confirm(userId: string, postId: string, idempotencyKey?: string) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 200)
      throw new BadRequestException('缺少有效的 Idempotency-Key。');
    const result = await this.recordView(userId, postId);
    return {
      isConfirmed: true,
      confirmedAt: result.viewers.find((viewer) => viewer.userId === userId)!.firstViewedAt,
      pendingConfirmationCount: 0,
    };
  }

  /** @deprecated Compatibility projection; there is no pending-reader list. */
  async getConfirmations(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    await this.getManageablePostOrThrow(postId);
    const viewers = await this.loadViewers(this.prisma, postId);
    return {
      postId,
      confirmedCount: viewers.length,
      recipientCount: viewers.length,
      confirmed: viewers.map((viewer) => ({ ...viewer, confirmedAt: viewer.firstViewedAt })),
      pending: [],
    };
  }

  /** @deprecated Old individual read requests count as actual views. */
  async markRead(userId: string, postId: string) {
    await this.recordView(userId, postId);
    return this.getSummary(userId);
  }

  /** @deprecated Browsing history cannot be erased by marking an article unread. */
  async markUnread(userId: string, _postId: string) {
    return this.getSummary(userId);
  }

  /** @deprecated Bulk acknowledgement is a no-op; it cannot manufacture views. */
  async markAllRead(userId: string) {
    return this.getSummary(userId);
  }

  async getAttachmentDownloadUrl(userId: string, attachmentId: string) {
    const attachment = await this.getReadableAttachmentOrThrow(userId, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章文件存储服务不可用。');
    }
    const url = await this.storageService.createDownloadUrl(
      attachment.storageKey,
      attachment.mimeType,
      attachment.originalName,
    );
    await this.incrementDownloadCount(attachment.id);
    return {
      url,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
    };
  }

  async getAttachmentViewUrl(actor: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.getViewableAttachmentOrThrow(actor, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章图片存储服务不可用。');
    }
    const url = await this.storageService.createViewUrl(attachment.storageKey, attachment.mimeType);
    return {
      url,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
    };
  }

  async getAttachmentStream(userId: string, attachmentId: string, range?: string) {
    const attachment = await this.getReadableAttachmentOrThrow(userId, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章文件存储服务不可用。');
    }
    try {
      const result = await this.storageService.getStream(attachment.storageKey, range);
      await this.incrementDownloadCount(attachment.id);
      return {
        attachment,
        stream: result.stream,
        contentLength: result.contentLength ?? attachment.size,
        contentRange: result.contentRange,
      };
    } catch (error) {
      const maybeAwsError = error as Error & {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (maybeAwsError.name === 'NoSuchKey' || maybeAwsError.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('文章文件不存在。');
      }
      if (range && (maybeAwsError.name === 'InvalidRange' || maybeAwsError.$metadata?.httpStatusCode === 416)) {
        throw new RangeNotSatisfiableException(attachment.size);
      }
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }

  private async assertCanManage(actor: AuthenticatedUser) {
    if (!isSubscriptionManagerRole(actor.role)) {
      throw new ForbiddenException('仅管理员可以管理文章。');
    }
    await this.permissionService.assertPermission(actor.role, 'manage_subscription_posts');
  }

  private async getManageablePostOrThrow(postId: string) {
    const post = await this.prisma.subscriptionPost.findUnique({
      where: { id: postId },
      include: subscriptionPostInclude,
    });
    if (!post) {
      throw new NotFoundException('文章不存在。');
    }
    return post;
  }

  private async getReadableAttachmentOrThrow(_userId: string, attachmentId: string) {
    const attachment = await this.prisma.subscriptionAttachment.findFirst({
      where: {
        id: attachmentId,
        status: SubscriptionAttachmentStatus.READY,
        post: { status: SubscriptionPostStatus.PUBLISHED },
      },
    });
    if (!attachment) {
      throw new NotFoundException('文章文件不存在。');
    }
    return attachment;
  }

  private async getViewableAttachmentOrThrow(actor: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.subscriptionAttachment.findFirst({
      where: {
        id: attachmentId,
        status: SubscriptionAttachmentStatus.READY,
        mimeType: { startsWith: 'image/' },
      },
      include: {
        post: { select: { status: true } },
      },
    });
    if (!attachment) {
      throw new NotFoundException('文章图片不存在。');
    }
    if (attachment.post.status === SubscriptionPostStatus.PUBLISHED) {
      return attachment;
    }
    if (attachment.post.status === SubscriptionPostStatus.DRAFT && (await this.canManage(actor))) {
      return attachment;
    }
    throw new NotFoundException('文章图片不存在。');
  }

  private incrementDownloadCount(attachmentId: string) {
    return this.prisma.subscriptionAttachment.update({
      where: { id: attachmentId },
      data: { downloadCount: { increment: 1 } },
      select: { id: true },
    });
  }

  private normalizePostInput(
    dto: CreateSubscriptionPostDto | UpdateSubscriptionPostDto,
    options: { allowEmptyTitle?: boolean } = {},
  ) {
    const data: {
      title?: string;
      body?: string;
      tags?: string[];
    } = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title && !options.allowEmptyTitle) {
        throw new BadRequestException('标题不能为空。');
      }
      data.title = title;
    }
    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.tags !== undefined) {
      data.tags = [...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean))];
    }
    return data;
  }

  private enqueueSubscriptionChanged(
    transaction: Prisma.TransactionClient,
    payload: {
      postId: string;
      reason: 'published' | 'viewed';
      actorUserId?: string;
    },
  ) {
    return this.outboxService.enqueue(transaction, {
      eventType: OUTBOX_EVENT_TYPES.subscriptionChanged,
      aggregateType: 'SubscriptionPost',
      aggregateId: payload.postId,
      payload,
    });
  }

  private serializePostSummary(post: SubscriptionPostWithViews) {
    return {
      id: post.id,
      status: post.status,
      title: post.title,
      bodyPreview: buildSubscriptionBodyPreview(post.body),
      tags: post.tags,
      isPinned: Boolean(post.pinnedAt),
      viewCount: post._count?.views ?? 0,
      isConfirmed: false,
      isRecipient: false,
      confirmedAt: null,
      confirmationProgress: null,
      isRead: false,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      attachmentCount: post.attachments.filter(
        (attachment) => attachment.usage === SubscriptionAttachmentUsage.DOWNLOADABLE_FILE,
      ).length,
      hasAttachments: post.attachments.some(
        (attachment) => attachment.usage === SubscriptionAttachmentUsage.DOWNLOADABLE_FILE,
      ),
    };
  }

  private serializePost(post: SubscriptionPostWithViews) {
    return {
      id: post.id,
      status: post.status,
      title: post.title,
      body: post.body,
      viewers: this.serializeViewers(post.views ?? []),
      tags: post.tags,
      isPinned: Boolean(post.pinnedAt),
      viewCount: post._count?.views ?? 0,
      isConfirmed: false,
      isRecipient: false,
      confirmedAt: null,
      confirmationProgress: null,
      isRead: false,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      attachments: post.attachments.map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: Number(attachment.size),
        sha256: attachment.sha256,
        downloadCount: Number(attachment.downloadCount),
        usage: attachment.usage,
      })),
    };
  }
}
